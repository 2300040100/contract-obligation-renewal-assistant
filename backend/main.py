
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from policy_service import check_policy_mismatches
from ai_service import analyze_contract
from database import Base, engine, get_db
from document_service import extract_text
from models import (
    Contract,
    Obligation,
    ContractVersion,
    ContractVersionObligation,
    CompanyPolicy,
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Contract Obligation and Renewal Assistant",
    description="API for contract analysis and obligation tracking",
    version="1.3.0",
)

# Create any missing tables without deleting existing data.
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://contract-obligation-renewal-assista.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompanyPolicyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)

@app.post("/policies", status_code=201)
def create_policy(
    policy: CompanyPolicyCreate,
    db: Session = Depends(get_db),
):
    name = policy.name.strip()
    description = policy.description.strip()

    if not name or not description:
        raise HTTPException(
            status_code=400,
            detail="Policy name and requirements are required.",
        )

    new_policy = CompanyPolicy(
        name=name,
        description=description,
    )

    db.add(new_policy)
    db.commit()
    db.refresh(new_policy)

    return {
        "id": new_policy.id,
        "name": new_policy.name,
        "description": new_policy.description,
        "created_at": new_policy.created_at,
    }



# -------------------- REQUEST MODELS --------------------

class ContractAnalysisRequest(BaseModel):
    text: str = Field(min_length=50, max_length=100000)


class SaveContractRequest(BaseModel):
    filename: str = Field(
        default="pasted_contract.txt",
        min_length=1,
        max_length=255,
    )
    text: str = Field(min_length=50, max_length=100000)
    analysis: dict


class CreateContractVersionRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    contract_text: str = Field(min_length=50, max_length=100000)


class ObligationReviewRequest(BaseModel):
    review_status: Literal["approved", "rejected", "pending"]


class ObligationUpdateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=5000)
    responsible_party: str | None = Field(default=None, max_length=500)
    deadline: str | None = Field(default=None, max_length=500)




class CompanyPolicyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)

# -------------------- HELPER FUNCTIONS --------------------



from datetime import datetime
import re

def get_renewal_details(analysis: dict) -> dict:
    # Read expiry date from the actual AI response.
    expiration = analysis.get("expiration_date")
    expiry_value = analysis.get("expiry_date")

    if not expiry_value and isinstance(expiration, dict):
        expiry_value = expiration.get("value")

    # Normalize the date to YYYY-MM-DD.
    expiry_date = None

    if expiry_value:
        value = str(expiry_value).strip()

        for fmt in (
            "%Y-%m-%d",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
        ):
            try:
                expiry_date = datetime.strptime(value, fmt).date().isoformat()
                break
            except ValueError:
                continue

    # Renewal date must be an actual date, not a description of renewal terms.
    renewal_value = analysis.get("renewal_date")
    renewal_date = None

    if renewal_value:
        value = str(renewal_value).strip()

        for fmt in (
            "%Y-%m-%d",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
        ):
            try:
                renewal_date = datetime.strptime(value, fmt).date().isoformat()
                break
            except ValueError:
                continue

    # Prefer the AI's numeric notice period.
    notice_value = analysis.get("notice_period_days")

    try:
        notice_period_days = (
            int(notice_value) if notice_value is not None else None
        )
        if notice_period_days is not None and notice_period_days < 0:
            notice_period_days = None
    except (TypeError, ValueError):
        notice_period_days = None

    return {
        "expiry_date": expiry_date,
        "renewal_date": renewal_date,
        "notice_period_days": notice_period_days,
    }

def snapshot_obligations(
    db: Session,
    version_id: int,
    obligations: list,
) -> None:
    """Save a historical copy of the supplied obligations."""

    for item in obligations:
        db.add(
            ContractVersionObligation(
                version_id=version_id,
                responsible_party=item.responsible_party,
                description=item.description,
                deadline=item.deadline,
                evidence=item.evidence,
                review_status=item.review_status,
                reviewed_at=item.reviewed_at,
            )
        )


def create_obligations_from_analysis(
    analysis: dict,
) -> list[Obligation]:
    """Convert AI obligation data into database models."""

    result = []

    for item in analysis.get("obligations", []):
        if not isinstance(item, dict) or not item.get("description"):
            continue

        result.append(
            Obligation(
                responsible_party=item.get("responsible_party"),
                description=str(item["description"]),
                deadline=item.get("deadline"),
                evidence=str(item.get("evidence") or ""),
                review_status="pending",
                reviewed_at=None,
            )
        )

    return result


def serialize_obligation(item) -> dict:
    """Convert an active or historical obligation to a dictionary."""

    return {
        "id": item.id,
        "responsible_party": item.responsible_party,
        "description": item.description,
        "deadline": item.deadline,
        "evidence": item.evidence,
        "review_status": item.review_status,
        "reviewed_at": (
            item.reviewed_at.isoformat()
            if item.reviewed_at
            else None
        ),
    }


# -------------------- BASIC ROUTES --------------------

@app.get("/")
def home():
    return {"message": "Contract Assistant API is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


# -------------------- EXTRACT CONTRACT --------------------

@app.post("/contracts/extract")
async def extract_contract(file: UploadFile = File(...)):
    filename = file.filename or ""

    if not filename.lower().endswith((".pdf", ".docx")):
        raise HTTPException(
            status_code=400,
            detail="Only PDF and DOCX files are supported.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File size must not exceed 10 MB.",
        )

    try:
        text = extract_text(filename, content)

        if not text or not text.strip():
            raise HTTPException(
                status_code=422,
                detail="No readable text was found in the document.",
            )

        return {
            "filename": filename,
            "characters": len(text),
            "text": text,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Document extraction failed")
        raise HTTPException(
            status_code=422,
            detail="Could not extract document text.",
        ) from exc


# -------------------- ANALYZE CONTRACT --------------------

@app.post("/contracts/analyze")
async def analyze_contract_endpoint(
    request: ContractAnalysisRequest,
):
    try:
        analysis = await analyze_contract(request.text)

        if not isinstance(analysis, dict):
            raise HTTPException(
                status_code=502,
                detail="AI analysis returned an unexpected response.",
            )

        return analysis

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Contract analysis failed")
        raise HTTPException(
            status_code=502,
            detail="Contract analysis failed. Check the backend terminal.",
        ) from exc


# -------------------- SAVE NEW CONTRACT --------------------

@app.post("/contracts/save")
def save_contract(
    request: SaveContractRequest,
    db: Session = Depends(get_db),
):
    try:
        renewal_details = get_renewal_details(request.analysis)
        print("DEBUG analysis:", request.analysis)
        print("DEBUG renewal details:", renewal_details)

        contract = Contract(
            filename=request.filename,
            contract_text=request.text,
            expiry_date=renewal_details["expiry_date"],
            renewal_date=renewal_details["renewal_date"],
            notice_period_days=renewal_details["notice_period_days"],
        )
        print("DEBUG contract before save:", contract.expiry_date, contract.renewal_date, contract.notice_period_days)

        contract.obligations.extend(
            create_obligations_from_analysis(request.analysis)
        )

        db.add(contract)
        db.flush()

        version = ContractVersion(
            contract_id=contract.id,
            version_number=1,
            filename=request.filename,
            contract_text=request.text,
        )

        db.add(version)
        db.flush()

        snapshot_obligations(
            db,
            version.id,
            contract.obligations,
        )

        db.commit()
        db.refresh(contract)
        print("DEBUG contract after database save:",
        contract.id,
        contract.expiry_date,
        contract.renewal_date,
        contract.notice_period_days)
        return {
            "message": "Contract saved successfully",
            "contract_id": contract.id,
            "version_id": version.id,
            "version_number": 1,
            "obligations_saved": len(contract.obligations),
            "expiry_date": contract.expiry_date,
            "renewal_date": contract.renewal_date,
            "notice_period_days": contract.notice_period_days,
        }

    except Exception as exc:
        db.rollback()
        logger.exception("Could not save contract")
        raise HTTPException(
            status_code=500,
            detail="Could not save the contract. Check the backend terminal.",
        ) from exc


# -------------------- LIST CONTRACTS --------------------

@app.get("/contracts")
def list_contracts(db: Session = Depends(get_db)):
    contracts = (
        db.query(Contract)
        .order_by(Contract.id.desc())
        .all()
    )

    return [
        {
            "id": contract.id,
            "filename": contract.filename,
            "created_at": contract.created_at.isoformat(),
            "obligations_count": len(contract.obligations),
            "expiry_date": contract.expiry_date,
            "renewal_date": contract.renewal_date,
            "notice_period_days": contract.notice_period_days,
        }
        for contract in contracts
    ]


# -------------------- READ VERSION HISTORY --------------------

@app.get("/contracts/{contract_id}/versions")
def get_contract_versions(
    contract_id: int,
    db: Session = Depends(get_db),
):
    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_id)
        .first()
    )

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    versions = (
        db.query(ContractVersion)
        .filter(ContractVersion.contract_id == contract_id)
        .order_by(ContractVersion.version_number.desc())
        .all()
    )

    return {
        "contract_id": contract.id,
        "filename": contract.filename,
        "versions": [
            {
                "id": version.id,
                "version_number": version.version_number,
                "filename": version.filename,
                "created_at": version.created_at.isoformat(),
                "contract_text": version.contract_text,
            }
            for version in versions
        ],
    }


# -------------------- READ A VERSION'S OBLIGATIONS --------------------

@app.get("/contracts/{contract_id}/versions/{version_number}/obligations")
def get_version_obligations(
    contract_id: int,
    version_number: int,
    db: Session = Depends(get_db),
):
    version = (
        db.query(ContractVersion)
        .filter(
            ContractVersion.contract_id == contract_id,
            ContractVersion.version_number == version_number,
        )
        .first()
    )

    if version is None:
        raise HTTPException(
            status_code=404,
            detail="Contract version not found.",
        )

    snapshots = (
        db.query(ContractVersionObligation)
        .filter(ContractVersionObligation.version_id == version.id)
        .order_by(ContractVersionObligation.id.asc())
        .all()
    )

    return {
        "contract_id": contract_id,
        "version_number": version.version_number,
        "obligations": [
            serialize_obligation(item)
            for item in snapshots
        ],
    }


# -------------------- CREATE A NEW CONTRACT VERSION --------------------

@app.post("/contracts/{contract_id}/versions")
async def create_contract_version(
    contract_id: int,
    request: CreateContractVersionRequest,
    db: Session = Depends(get_db),
):
    try:
        contract = (
            db.query(Contract)
            .filter(Contract.id == contract_id)
            .with_for_update()
            .first()
        )

        if contract is None:
            raise HTTPException(
                status_code=404,
                detail="Contract not found.",
            )

        versions = (
            db.query(ContractVersion)
            .filter(ContractVersion.contract_id == contract_id)
            .order_by(ContractVersion.version_number.desc())
            .all()
        )

        # Create a historical version for older contracts if needed.
        if not versions:
            old_version = ContractVersion(
                contract_id=contract.id,
                version_number=1,
                filename=contract.filename,
                contract_text=contract.contract_text,
            )

            db.add(old_version)
            db.flush()

            snapshot_obligations(
                db,
                old_version.id,
                contract.obligations,
            )

            next_version_number = 2
        else:
            next_version_number = versions[0].version_number + 1

        # Analyze the revised text before changing active obligations.
        analysis = await analyze_contract(request.contract_text)

        if not isinstance(analysis, dict):
            raise HTTPException(
                status_code=502,
                detail="AI analysis returned an unexpected response.",
            )

        new_obligations = create_obligations_from_analysis(analysis)

        if not new_obligations:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No obligations were extracted. Existing active "
                    "obligations have not been replaced."
                ),
            )

        renewal_details = get_renewal_details(analysis)

        new_version = ContractVersion(
            contract_id=contract.id,
            version_number=next_version_number,
            filename=request.filename,
            contract_text=request.contract_text,
        )

        db.add(new_version)
        db.flush()

        snapshot_obligations(
            db,
            new_version.id,
            new_obligations,
        )

        # Replace active obligations while keeping historical snapshots.
        contract.obligations.clear()
        contract.obligations.extend(new_obligations)

        contract.filename = request.filename
        contract.contract_text = request.contract_text
        contract.expiry_date = renewal_details["expiry_date"]
        contract.renewal_date = renewal_details["renewal_date"]
        contract.notice_period_days = renewal_details["notice_period_days"]

        db.commit()
        db.refresh(new_version)
        db.refresh(contract)

        return {
            "message": "Revised contract analyzed and saved successfully.",
            "contract_id": contract.id,
            "version_id": new_version.id,
            "version_number": new_version.version_number,
            "obligations_saved": len(new_obligations),
            "review_status": "pending",
            "expiry_date": contract.expiry_date,
            "renewal_date": contract.renewal_date,
            "notice_period_days": contract.notice_period_days,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()
        logger.exception("Could not create and analyze contract version")
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not create the contract version. "
                "Check the backend terminal."
            ),
        ) from exc


# -------------------- REVIEW OBLIGATIONS --------------------

@app.put("/obligations/{obligation_id}")
def update_obligation(
    obligation_id: int,
    request: ObligationUpdateRequest,
    db: Session = Depends(get_db),
):
    """Persist edits to a saved obligation."""
    obligation = (
        db.query(Obligation)
        .filter(Obligation.id == obligation_id)
        .first()
    )

    if obligation is None:
        raise HTTPException(
            status_code=404,
            detail="Obligation not found.",
        )

    description = request.description.strip()
    if not description:
        raise HTTPException(
            status_code=400,
            detail="Obligation description cannot be empty.",
        )

    obligation.description = description
    obligation.deadline = request.deadline.strip() if request.deadline and request.deadline.strip() else None
    obligation.responsible_party = (
        request.responsible_party.strip()
        if request.responsible_party and request.responsible_party.strip()
        else None
    )
    # Editing means it must be reviewed again.
    obligation.review_status = "pending"
    obligation.reviewed_at = None

    try:
        db.commit()
        db.refresh(obligation)
    except Exception as exc:
        db.rollback()
        logger.exception("Could not update obligation")
        raise HTTPException(
            status_code=500,
            detail="Could not update the obligation.",
        ) from exc

    return {
        "message": "Obligation updated successfully",
        **serialize_obligation(obligation),
    }


@app.patch("/obligations/{obligation_id}/review")
def update_obligation_review(
    obligation_id: int,
    request: ObligationReviewRequest,
    db: Session = Depends(get_db),
):
    obligation = (
        db.query(Obligation)
        .filter(Obligation.id == obligation_id)
        .first()
    )

    if obligation is None:
        raise HTTPException(
            status_code=404,
            detail="Obligation not found.",
        )

    obligation.review_status = request.review_status
    obligation.reviewed_at = (
        datetime.now(timezone.utc)
        if request.review_status in ("approved", "rejected")
        else None
    )

    try:
        db.commit()
        db.refresh(obligation)

    except Exception as exc:
        db.rollback()
        logger.exception("Could not update review status")
        raise HTTPException(
            status_code=500,
            detail="Could not update review status.",
        ) from exc

    return {
        "message": "Review status updated",
        "obligation_id": obligation.id,
        "review_status": obligation.review_status,
        "reviewed_at": (
            obligation.reviewed_at.isoformat()
            if obligation.reviewed_at
            else None
        ),
    }


# -------------------- EDIT OBLIGATION --------------------

@app.patch("/obligations/{obligation_id}")
def edit_obligation(
    obligation_id: int,
    request: ObligationUpdateRequest,
    db: Session = Depends(get_db),
):
    obligation = (
        db.query(Obligation)
        .filter(Obligation.id == obligation_id)
        .first()
    )

    if obligation is None:
        raise HTTPException(
            status_code=404,
            detail="Obligation not found.",
        )

    obligation.description = request.description.strip()

    obligation.responsible_party = (
        request.responsible_party.strip()
        if request.responsible_party
        and request.responsible_party.strip()
        else None
    )

    obligation.deadline = (
        request.deadline.strip()
        if request.deadline
        and request.deadline.strip()
        else None
    )

    # Edited obligations must be reviewed again.
    obligation.review_status = "pending"
    obligation.reviewed_at = None

    try:
        db.commit()
        db.refresh(obligation)

    except Exception as exc:
        db.rollback()
        logger.exception("Could not update obligation")
        raise HTTPException(
            status_code=500,
            detail="Could not update the obligation.",
        ) from exc

    return {
        "message": "Obligation updated successfully",
        "obligation": {
            **serialize_obligation(obligation),
            "contract_id": obligation.contract_id,
        },
    }


# -------------------- GET CONTRACT DETAILS --------------------

@app.get("/contracts/{contract_id}")
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
):
    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_id)
        .first()
    )

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    return {
        "id": contract.id,
        "filename": contract.filename,
        "contract_text": contract.contract_text,
        "created_at": contract.created_at.isoformat(),
        "expiry_date": contract.expiry_date,
        "renewal_date": contract.renewal_date,
        "notice_period_days": contract.notice_period_days,
        "obligations": [
            serialize_obligation(item)
            for item in contract.obligations
        ],
    }

from datetime import date, datetime, timedelta

def parse_contract_date(value):
    """Parse common contract date formats safely."""
    if not value:
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    value = str(value).strip()
    if not value:
        return None

    # Handle ISO dates and ISO timestamps.
    try:
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        ).date()
    except ValueError:
        pass

    formats = (
        "%B %d, %Y",
        "%b %d, %Y",
        "%d %B %Y",
        "%d %b %Y",
        "%m/%d/%Y",
        "%d/%m/%Y",
    )

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    return None

@app.delete("/contracts/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_id)
        .first()
    )

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail="Contract not found",
        )

    try:
        # Delete saved obligations for each contract version.
        versions = (
            db.query(ContractVersion)
            .filter(ContractVersion.contract_id == contract_id)
            .all()
        )

        version_ids = [version.id for version in versions]

        if version_ids:
            db.query(ContractVersionObligation).filter(
                ContractVersionObligation.version_id.in_(version_ids)
            ).delete(synchronize_session=False)

        # Delete contract version history.
        db.query(ContractVersion).filter(
            ContractVersion.contract_id == contract_id
        ).delete(synchronize_session=False)

        # Contract.obligations has delete-orphan cascade.
        db.delete(contract)
        db.commit()

        return {
            "message": "Contract deleted successfully",
            "contract_id": contract_id,
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete contract",
        )


@app.get("/renewals/upcoming")
def get_upcoming_renewals(
    days: int = 90,
    db: Session = Depends(get_db),
):
    if days < 1 or days > 3650:
        raise HTTPException(
            status_code=400,
            detail="days must be between 1 and 3650.",
        )

    today = date.today()
    end_date = today + timedelta(days=days)

    contracts = (
        db.query(Contract)
        .order_by(Contract.id.desc())
        .all()
    )

    alerts = []

    for contract in contracts:
        expiry = parse_contract_date(contract.expiry_date)
        renewal = parse_contract_date(contract.renewal_date)

        # Prefer a scheduled renewal date; otherwise use expiry.
        alert_date = renewal if renewal is not None else expiry

        if alert_date is None:
            continue

        if not today <= alert_date <= end_date:
            continue

        days_remaining = (alert_date - today).days

        alerts.append({
            "contract_id": contract.id,
            "filename": contract.filename,
            "expiry_date": (
                expiry.isoformat() if expiry else None
            ),
            "renewal_date": (
                renewal.isoformat() if renewal else None
            ),
            "notice_period_days": contract.notice_period_days,
            "alert_date": alert_date.isoformat(),
            "days_remaining": days_remaining,
            "alert_type": (
                "renewal" if renewal is not None else "expiration"
            ),
            "message": (
                f"Contract date is today: {contract.filename}"
                if days_remaining == 0
                else (
                    f"{contract.filename}: "
                    f"{days_remaining} days remaining"
                )
            ),
        })

    alerts.sort(key=lambda item: item["days_remaining"])

    return {
        "checked_on": today.isoformat(),
        "window_days": days,
        "count": len(alerts),
        "alerts": alerts,
    }

@app.get("/renewals/notice-deadlines")
def get_notice_deadlines(
    days: int = 90,
    db: Session = Depends(get_db),
):
    if days < 1 or days > 3650:
        raise HTTPException(
            status_code=400,
            detail="days must be between 1 and 3650.",
        )

    today = date.today()
    end_date = today + timedelta(days=days)

    contracts = (
        db.query(Contract)
        .order_by(Contract.id.desc())
        .all()
    )

    alerts = []

    for contract in contracts:
        expiry = parse_contract_date(contract.expiry_date)
        notice_period = contract.notice_period_days

        if expiry is None or notice_period is None:
            continue

        try:
            notice_period = int(notice_period)
        except (TypeError, ValueError):
            continue

        if notice_period < 0:
            continue

        notice_deadline = expiry - timedelta(days=notice_period)

        if not today <= notice_deadline <= end_date:
            continue

        days_remaining = (notice_deadline - today).days

        alerts.append({
            "contract_id": contract.id,
            "filename": contract.filename,
            "expiry_date": expiry.isoformat(),
            "notice_period_days": notice_period,
            "notice_deadline": notice_deadline.isoformat(),
            "days_remaining": days_remaining,
            "message": (
                f"Notice deadline is today: {contract.filename}"
                if days_remaining == 0
                else (
                    f"{contract.filename}: notice deadline in "
                    f"{days_remaining} days"
                )
            ),
        })

    alerts.sort(key=lambda item: item["days_remaining"])

    return {
        "checked_on": today.isoformat(),
        "window_days": days,
        "count": len(alerts),
        "alerts": alerts,
    }


class PolicyCheckRequest(BaseModel):
    policy_ids: list[int] = Field(min_length=1, max_length=50)


@app.post("/contracts/{contract_id}/policy-check")
async def check_contract_policies(
    contract_id: int,
    request: PolicyCheckRequest,
    db: Session = Depends(get_db)
):
    contract = db.query(Contract).filter(
        Contract.id == contract_id
    ).first()

    if not contract:
        raise HTTPException(
            status_code=404,
            detail="Contract not found."
        )

    # Remove duplicate policy IDs while preserving their order
    policy_ids = list(dict.fromkeys(request.policy_ids))

    policies = (
        db.query(CompanyPolicy)
        .filter(CompanyPolicy.id.in_(policy_ids))
        .all()
    )

    policies_by_id = {policy.id: policy for policy in policies}

    missing_ids = [
        policy_id
        for policy_id in policy_ids
        if policy_id not in policies_by_id
    ]

    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Some company policies were not found.",
                "missing_policy_ids": missing_ids
            }
        )

    company_policies = [
        f"Policy: {policies_by_id[policy_id].name}\n"
        f"Requirements: {policies_by_id[policy_id].description}"
        for policy_id in policy_ids
    ]

    try:
        result = await check_policy_mismatches(
            contract.contract_text,
            company_policies
        )
    except Exception:
        logger.exception("Policy check failed")
        raise HTTPException(
            status_code=502,
            detail="Policy analysis failed. Please try again."
        )

    return {
        "contract_id": contract.id,
        "filename": contract.filename,
        "checked_policy_ids": policy_ids,
        "checked_policy_count": len(company_policies),
        "result": result
    }

@app.get("/policies")
def get_policies(db: Session = Depends(get_db)):
    policies = (
        db.query(CompanyPolicy)
        .order_by(CompanyPolicy.id.desc())
        .all()
    )

    return [
        {
            "id": policy.id,
            "name": policy.name,
            "description": policy.description,
            "created_at": policy.created_at
        }
        for policy in policies
    ]


@app.put("/policies/{policy_id}")
def update_policy(
    policy_id: int,
    request: CompanyPolicyUpdate,
    db: Session = Depends(get_db)
):
    policy = db.query(CompanyPolicy).filter(
        CompanyPolicy.id == policy_id
    ).first()

    if not policy:
        raise HTTPException(
            status_code=404,
            detail="Company policy not found."
        )

    name = request.name.strip()
    description = request.description.strip()

    if not name or not description:
        raise HTTPException(
            status_code=400,
            detail="Policy name and description cannot be empty."
        )

    policy.name = name
    policy.description = description

    db.commit()
    db.refresh(policy)

    return {
        "message": "Company policy updated successfully",
        "policy": {
            "id": policy.id,
            "name": policy.name,
            "description": policy.description,
            "created_at": policy.created_at
        }
    }


@app.delete("/policies/{policy_id}")
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db)
):
    policy = db.query(CompanyPolicy).filter(
        CompanyPolicy.id == policy_id
    ).first()

    if not policy:
        raise HTTPException(
            status_code=404,
            detail="Company policy not found."
        )

    db.delete(policy)
    db.commit()

    return {"message": "Company policy deleted successfully"}