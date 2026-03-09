Minimal Flask fallback to handle authentication when Node is unavailable.

Quick start (Windows PowerShell):

```powershell
cd c:\Users\hp\Music\edson\backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r flask_auth\requirements.txt
python flask_auth\app.py
```

The server listens on port configured by `PORT` env var (defaults to 3000). It provides:
- `POST /api/auth/signup` {username,email,password}
- `POST /api/auth/login` {email,password}
- `POST /api/auth/google` {email,name} (simple fallback)

It uses `users.json` in `backend/` for storage when MongoDB/Node is unavailable.
