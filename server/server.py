"""Local-only profile API for Pilgrim Desk. Uses SQLite and Python's stdlib."""

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = "127.0.0.1"
PORT = 8765
DB_PATH = Path(__file__).with_name("pilgrim_profiles.sqlite3")
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
AUTOMATION_PATH = "/api/automation/run"
GENERAL_PATH = "/api/general"
GENERAL_AUTOMATION_PATH = "/api/automation/general"


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        gender TEXT NOT NULL,
        id_type TEXT NOT NULL,
        id_number TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS general_details (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        email TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'India',
        pincode TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
    )""")
    db.execute("INSERT OR IGNORE INTO general_details (id, updated_at) VALUES (1, ?)", (time.time_ns() // 1_000_000,))
    return db


@contextmanager
def database():
    db = connect()
    try:
        yield db
        db.commit()
    finally:
        db.close()


def serialize(row):
    return {
        "id": row["id"], "name": row["name"], "age": row["age"],
        "gender": row["gender"], "idType": row["id_type"],
        "idNumber": row["id_number"], "nickname": row["nickname"],
        "updatedAt": row["updated_at"],
    }


def select_dropdown(pg, value, mode, option_index, typing_interval, manual_pause):
    if mode == "manual_pause":
        time.sleep(manual_pause)
        return
    pg.press("enter")
    if mode == "arrow_index":
        pg.press("home")
        pg.press("down", presses=option_index, interval=0.05)
        pg.press("enter")
        return
    pg.write(value, interval=typing_interval)
    pg.press("enter")


def fill_text(pg, value, typing_interval):
    text = str(value)
    time.sleep(0.35)
    try:
        pg.write(text, interval=typing_interval)
    except Exception:
        try:
            import pyperclip
            pyperclip.copy(text)
            pg.hotkey("ctrl", "a")
            pg.hotkey("ctrl", "v")
        except Exception:
            raise


def fill_numeric(pg, value, typing_interval):
    digits = "".join(character for character in str(value) if character.isdigit())
    time.sleep(0.35)
    for digit in digits:
        pg.press(digit)
        if typing_interval:
            time.sleep(typing_interval)
class Handler(BaseHTTPRequestHandler):
    server_version = "PilgrimDesk/0.1"

    def log_message(self, _format, *_args):
        # Avoid logging request bodies or personal information.
        return

    def end_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 20000:
            raise ValueError("Request body is too large")
        return json.loads(self.rfile.read(length) or b"{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == GENERAL_PATH:
            with database() as db:
                row = db.execute("SELECT email, city, state, country, pincode, updated_at FROM general_details WHERE id=1").fetchone()
            return self.send_json(200, dict(row))
        if path != "/api/profiles":
            return self.send_json(404, {"error": "Not found"})
        with database() as db:
            rows = db.execute("SELECT * FROM profiles ORDER BY name COLLATE NOCASE").fetchall()
        self.send_json(200, [serialize(row) for row in rows])

    def do_POST(self):
        path = urlparse(self.path).path
        if path == GENERAL_AUTOMATION_PATH:
            return self.run_general_automation()
        if path == AUTOMATION_PATH:
            return self.run_automation()
        if path != "/api/profiles":
            return self.send_json(404, {"error": "Not found"})
        try:
            data = self.read_body()
            required = ("name", "age", "gender", "idType", "idNumber")
            if any(not str(data.get(key, "")).strip() for key in required):
                return self.send_json(400, {"error": "Name, age, gender, ID type, and ID number are required."})
            age = int(data["age"])
            if age < 1 or age > 120:
                return self.send_json(400, {"error": "Age must be between 1 and 120."})
            profile_id = str(uuid.uuid4())
            values = (profile_id, str(data["name"]).strip()[:100], age,
                      str(data["gender"])[:30], str(data["idType"])[:40],
                      str(data["idNumber"]).strip()[:64], str(data.get("nickname", "")).strip()[:40],
                      time.time_ns() // 1_000_000)
            with database() as db:
                db.execute("INSERT INTO profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values)
            self.send_json(201, {"id": profile_id})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid profile data."})

    def run_automation(self):
        try:
            data = self.read_body()
            profiles = data.get("profiles")
            if not isinstance(profiles, list) or not profiles:
                return self.send_json(400, {"error": "Select at least one pilgrim."})
            if len(profiles) > 20:
                return self.send_json(400, {"error": "A maximum of 20 pilgrims can be filled at once."})
            countdown = max(1, min(30, int(data.get("countdown", 5))))
            field_delay = max(0, min(2, float(data.get("fieldDelay", 0.15))))
            typing_interval = max(0, min(1, float(data.get("typingInterval", 0.03))))
            manual_pause = max(1, min(30, float(data.get("dropdownPause", 5))))
            id_field_pause = max(1, min(30, float(data.get("idFieldPause", 5))))
            gender_mode = str(data.get("genderMode", "type_enter"))
            id_mode = str(data.get("idMode", "type_enter"))
            gender_index = max(0, min(20, int(data.get("genderIndex", 0))))
            id_index = max(0, min(20, int(data.get("idIndex", 0))))
            for profile in profiles:
                required = ("name", "age", "gender", "idType", "idNumber")
                if not isinstance(profile, dict) or any(not str(profile.get(key, "")).strip() for key in required):
                    return self.send_json(400, {"error": "Every selected pilgrim must have complete details."})
            try:
                import pyautogui as pg
            except ImportError:
                return self.send_json(503, {"error": "PyAutoGUI is not installed. Install it in the Python environment running server.py."})
            pg.FAILSAFE = True
            pg.PAUSE = field_delay
            for remaining in range(countdown, 0, -1):
                time.sleep(1)
            for profile_index, profile in enumerate(profiles):
                fill_text(pg, profile["name"], typing_interval)
                pg.press("tab")
                fill_text(pg, profile["age"], typing_interval)
                pg.press("tab")
                # select_dropdown(pg, str(profile["gender"]), gender_mode, gender_index, typing_interval, manual_pause)
                # pg.press("tab")
                # select_dropdown(pg, str(profile["idType"]), id_mode, id_index, typing_interval, manual_pause)
                # pg.press("tab")
                if id_mode == "manual_pause":
                    time.sleep(id_field_pause)
                fill_numeric(pg, profile["idNumber"], typing_interval)
                if profile_index < len(profiles) - 1:
                    pg.press("tab")
            return self.send_json(200, {"ok": True, "count": len(profiles)})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid automation settings."})
        except Exception as error:
            if error.__class__.__name__ in {"FailSafeException", "KeyboardInterrupt"}:
                return self.send_json(409, {"error": "Automation stopped by PyAutoGUI failsafe."})
            self.send_json(500, {"error": "Automation stopped before completion."})

    def run_general_automation(self):
        try:
            data = self.read_body()
            countdown = max(1, min(30, int(data.get("countdown", 5))))
            typing_interval = max(0, min(1, float(data.get("typingInterval", 0.03))))
            fields = (data.get("email", ""), data.get("city", ""), data.get("state", ""), data.get("country", ""), data.get("pincode", ""))
            if not any(str(value).strip() for value in fields):
                return self.send_json(400, {"error": "Save at least one General Details value first."})
            try:
                import pyautogui as pg
            except ImportError:
                return self.send_json(503, {"error": "PyAutoGUI is not installed. Install it in the Python environment running server.py."})
            pg.FAILSAFE = True
            pg.PAUSE = 0.12
            for _ in range(countdown):
                time.sleep(1)
            values = [str(value).strip() for value in fields]
            last_index = max((index for index, value in enumerate(values) if value), default=-1)
            for index, value in enumerate(values):
                if not value:
                    pg.press("tab")
                    continue
                fill_text(pg, value, typing_interval)
                if index < last_index:
                    pg.press("tab")
            return self.send_json(200, {"ok": True, "count": last_index + 1})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid General Details settings."})

    def do_PUT(self):
        if urlparse(self.path).path == GENERAL_PATH:
            try:
                data = self.read_body()
                values = (str(data.get("email", "")).strip()[:160], str(data.get("city", "")).strip()[:80], str(data.get("state", "")).strip()[:80], str(data.get("country", "India")).strip()[:80], str(data.get("pincode", "")).strip()[:12], time.time_ns() // 1_000_000)
                with database() as db:
                    db.execute("UPDATE general_details SET email=?, city=?, state=?, country=?, pincode=?, updated_at=? WHERE id=1", values)
                return self.send_json(200, {"ok": True})
            except (ValueError, TypeError, json.JSONDecodeError):
                return self.send_json(400, {"error": "Invalid General Details."})
        profile_id = self.profile_id()
        if not profile_id:
            return self.send_json(404, {"error": "Not found"})
        try:
            data = self.read_body()
            age = int(data.get("age", 0))
            fields = (str(data.get("name", "")).strip()[:100], age,
                      str(data.get("gender", ""))[:30], str(data.get("idType", ""))[:40],
                      str(data.get("idNumber", "")).strip()[:64], str(data.get("nickname", "")).strip()[:40],
                      time.time_ns() // 1_000_000, profile_id)
            if not all(fields[index] for index in (0, 2, 3, 4)) or age < 1 or age > 120:
                return self.send_json(400, {"error": "Complete all required fields and enter an age from 1 to 120."})
            with database() as db:
                cur = db.execute("UPDATE profiles SET name=?, age=?, gender=?, id_type=?, id_number=?, nickname=?, updated_at=? WHERE id=?", fields)
                if cur.rowcount == 0:
                    return self.send_json(404, {"error": "Profile not found"})
            self.send_json(200, {"ok": True})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid profile data."})

    def do_DELETE(self):
        profile_id = self.profile_id()
        if not profile_id:
            return self.send_json(404, {"error": "Not found"})
        with database() as db:
            cur = db.execute("DELETE FROM profiles WHERE id=?", (profile_id,))
        if cur.rowcount == 0:
            return self.send_json(404, {"error": "Profile not found"})
        self.send_response(204)
        self.end_headers()

    def profile_id(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        return unquote(parts[2]) if len(parts) == 3 and parts[:2] == ["api", "profiles"] else None


if __name__ == "__main__":
    connect().close()
    print(f"Pilgrim Desk local API listening at http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
