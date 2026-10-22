# Pilgrim Desk

Local React frontend with a Python standard-library API and SQLite database. Profile records, including ID numbers, stay on this computer. The API binds only to `127.0.0.1` and does not log request bodies.

## Run locally

1. Install the automation dependency once: `python -m pip install -r server/requirements.txt`
2. Start the Python service from this folder: `python server/server.py`
3. In a second terminal, install frontend dependencies with `npm install`.
4. Start Vite with `npm run dev` and open the localhost URL it prints.

The frontend sends profile CRUD requests to the Python service at `http://127.0.0.1:8765`; SQLite data is stored in `server/pilgrim_profiles.sqlite3`.

## Phase 1 scope

The current UI supports validated profile CRUD, persistent local storage, search, multi-select, drag-and-drop or arrow-button ordering, and a booking preparation checklist for any number of pilgrims. Photo ID numbers are masked in the checklist and are never copied from that screen.

The **Start keyboard autofill** button invokes the localhost Python service after a configurable countdown. Keep the cursor in the first Name field before starting. The engine types Name and Age, then handles Gender and Photo ID Proof using one of three strategies: type text and press Enter, open the dropdown and use Home/Down/Enter, or pause for manual selection. In manual-pause mode, select each readonly dropdown yourself during the configured pause; the engine then presses Tab, types the ID number, and continues to the next pilgrim.

The engine never submits a booking, processes payments, interacts with CAPTCHA, or bypasses queues. Move the mouse to the top-left corner during the countdown or while typing to trigger PyAutoGUI's emergency failsafe. Review the form manually after execution; keystrokes do not guarantee that the website accepted a value.

The current database is local SQLite behind the localhost Python service rather than IndexedDB. This preserves the requested React-to-Python architecture and makes the persistence boundary explicit; encryption and optional backup/restore remain follow-up security work.

The automation UI also includes a compact General Details card for Email, City, State, Country, and Pincode. Gothram is intentionally excluded. Save those values locally, place the cursor in the first General Details field on the booking page, and click **Fill General Details**. Review the result, then run pilgrim autofill separately.

Each pilgrim also has one optional Family tag. The manager provides By Group and Individual views; selecting a group selects all visible members in one action, while Individual mode allows precise member selection.
