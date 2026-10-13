
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {
        "message": "Contract Assistant API is running!"
    }


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_docs_available():
    response = client.get("/docs")
    assert response.status_code == 200


def test_extract_rejects_unsupported_file():
    response = client.post(
        "/contracts/extract",
        files={
            "file": (
                "notes.txt",
                b"This is a test file.",
                "text/plain",
            )
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Only PDF and DOCX files are supported."
    )


def test_extract_rejects_empty_pdf():
    response = client.post(
        "/contracts/extract",
        files={
            "file": (
                "empty.pdf",
                b"",
                "application/pdf",
            )
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "The uploaded file is empty."
    )
