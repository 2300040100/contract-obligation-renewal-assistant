
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Date
from sqlalchemy.orm import relationship

from database import Base


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    contract_text = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    
    expiry_date = Column(Date, nullable=True)
    renewal_date = Column(Date, nullable=True)
    notice_period_days = Column(Integer, nullable=True)


    obligations = relationship(
        "Obligation",
        back_populates="contract",
        cascade="all, delete-orphan",
    )


class Obligation(Base):
    __tablename__ = "obligations"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    responsible_party = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    deadline = Column(String(100), nullable=True)
    evidence = Column(Text, nullable=False)
    review_status = Column(String(20), default="pending", nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    contract = relationship("Contract", back_populates="obligations")


class ContractVersion(Base):
    __tablename__ = "contract_versions"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(
        Integer,
        ForeignKey("contracts.id"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False)
    filename = Column(String(255), nullable=False)
    contract_text = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ContractVersionObligation(Base):
    __tablename__ = "contract_version_obligations"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(
        Integer,
        ForeignKey("contract_versions.id"),
        nullable=False,
        index=True,
    )
    responsible_party = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    deadline = Column(String(100), nullable=True)
    evidence = Column(Text, nullable=False)
    review_status = Column(String(20), nullable=False, default="pending")
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
class CompanyPolicy(Base):
    __tablename__ = "company_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )