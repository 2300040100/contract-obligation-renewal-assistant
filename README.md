# Contract Obligation and Renewal Assistant

An AI-powered full-stack application that helps users analyze contracts, identify important obligations, and track renewal dates and notice deadlines.

## Features

- **Contract Upload:** Upload PDF and DOCX files and extract contract text.
- **AI Contract Analysis:** Use a Groq-powered language model to identify contract parties, key terms, and obligations.
- **Obligation Management:** Review, approve, or reject extracted obligations.
- **Contract Dashboard:** View saved contracts and search and filter contract records.
- **Renewal Alerts:** Track upcoming contract renewals and notice deadlines.
- **Database Persistence:** Store contracts and obligations in PostgreSQL.
- **Web Interface:** Use a React-based frontend to interact with the backend.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| ORM and Validation | SQLAlchemy, Pydantic |
| AI Integration | Groq API |
| Deployment | Vercel, Render |

## Application Architecture

1. The user uploads a contract through the React frontend.
2. The FastAPI backend extracts the contract text.
3. The backend sends relevant text to the Groq language model for analysis.
4. The user reviews the extracted information and obligations.
5. Saved contract data is stored in PostgreSQL.
6. The application displays contract records, obligation statuses, and renewal alerts.

## Run Locally

### Prerequisites

- Python 3.11+
- Node.js and npm
- PostgreSQL
- A Groq API key

### 1. Backend Setup

Open a terminal in the project root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

Create a `backend/.env` file and configure the required environment variables using the names expected by the backend code.

Start the backend:

```bash
uvicorn main:app --reload
```

Backend API: http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

### 2. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env` with the backend URL:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Start the frontend:

```bash
npm run dev
```

Frontend: http://localhost:5173

## Environment Variables

Configure the required database connection and Groq API key in the backend environment. The frontend uses `VITE_API_URL` to identify the backend API.

Never commit API keys, passwords, or database credentials to GitHub.

## Deployment

- Frontend: Vercel
- Backend: Render
- Database: PostgreSQL

Set the production `VITE_API_URL` to the deployed backend URL in Vercel. Configure the backend's database credentials, Groq API key, and allowed frontend origin in Render.

## Important Note

AI-generated contract analysis may contain errors or omissions. Users should review extracted obligations and dates before relying on them. This application is intended to support contract review, not replace professional legal advice.

## Future Improvements

- Automated tests for API endpoints and frontend workflows
- Improved date extraction and notification scheduling
- Role-based access control
- Audit logs for approval decisions
- More detailed contract analysis reports
