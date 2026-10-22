import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clipboard,
  GripVertical,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

const SERVICE = "http://127.0.0.1:8765";
const API = `${SERVICE}/api/profiles`;
const blank = {
  name: "",
  age: "",
  gender: "",
  idType: "",
  idNumber: "",
  nickname: "",
  groupName: "",
};
const blankGeneral = {
  email: "",
  city: "",
  state: "",
  country: "India",
  pincode: "",
};

async function request(path = "", options = {}) {
  const { base = API, ...fetchOptions } = options;
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...fetchOptions,
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ||
        `Python service returned ${response.status}`,
    );
  return response.status === 204 ? null : response.json();
}

export default function App() {
  const [profiles, setProfiles] = useState([]);
  const [serviceState, setServiceState] = useState("connecting");
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const [prepared, setPrepared] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [automation, setAutomation] = useState({
    countdown: 5,
    dropdownPause: 5,
    idFieldPause: 5,
    fieldDelay: 0.15,
    typingInterval: 0.03,
    genderMode: "manual_pause",
    idMode: "manual_pause",
    genderIndex: 0,
    idIndex: 0,
  });
  const [automationState, setAutomationState] = useState("idle");
  const [general, setGeneral] = useState({ ...blankGeneral });
  const [generalState, setGeneralState] = useState("idle");
  const [viewMode, setViewMode] = useState("group");

  async function refresh() {
    try {
      const [profileData, generalData] = await Promise.all([
        request(),
        request("/api/general", { base: SERVICE }),
      ]);
      setProfiles(profileData);
      setGeneral({ ...blankGeneral, ...generalData });
      setServiceState("connected");
    } catch {
      setServiceState("offline");
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const filtered = useMemo(
    () =>
      profiles.filter((p) =>
        `${p.name} ${p.nickname || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [profiles, search],
  );
  const ordered = useMemo(
    () =>
      selected.map((id) => profiles.find((p) => p.id === id)).filter(Boolean),
    [selected, profiles],
  );
  const groups = useMemo(
    () => [
      ...new Set(profiles.map((profile) => profile.groupName).filter(Boolean)),
    ],
    [profiles],
  );
  const groupedProfiles = useMemo(
    () =>
      groups.map((groupName) => ({
        groupName,
        members: profiles.filter((profile) => profile.groupName === groupName),
      })),
    [groups, profiles],
  );

  function startAdd() {
    setEditing("new");
    setForm({ ...blank });
    setPrepared(false);
  }
  function startEdit(p) {
    setEditing(p.id);
    setForm({ ...p, age: String(p.age) });
  }
  async function save(e) {
    e.preventDefault();
    const clean = {
      ...form,
      name: form.name.trim(),
      nickname: form.nickname.trim(),
      age: Number(form.age),
      idNumber: form.idNumber.trim(),
    };
    if (
      !clean.name ||
      !clean.age ||
      !clean.gender ||
      !clean.idType ||
      !clean.idNumber
    ) {
      setNotice("Complete all required fields before saving.");
      return;
    }
    try {
      if (editing === "new")
        await request("", { method: "POST", body: JSON.stringify(clean) });
      else
        await request(`/${encodeURIComponent(editing)}`, {
          method: "PUT",
          body: JSON.stringify(clean),
        });
      await refresh();
      setEditing(null);
      setForm({ ...blank });
      setNotice("Profile saved in the local database.");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function remove(id) {
    if (!window.confirm("Delete this pilgrim profile from the local database?"))
      return;
    try {
      await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSelected(selected.filter((x) => x !== id));
      setPrepared(false);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  }
  function move(index, delta) {
    const at = index + delta;
    if (at < 0 || at >= selected.length) return;
    const next = [...selected];
    [next[index], next[at]] = [next[at], next[index]];
    setSelected(next);
    setPrepared(false);
  }
  function reorder(dragged, target) {
    if (!dragged || dragged === target) return;
    const next = [...selected];
    const from = next.indexOf(dragged);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    setSelected(next);
    setPrepared(false);
  }
  function prepareAutofill() {
    if (!ordered.length) {
      setNotice("Select at least one pilgrim first.");
      return;
    }
    setPrepared(true);
    setNotice(
      "Checklist prepared. The Python autofill engine is not enabled in Phase 1.",
    );
  }
  async function startAutomation() {
    if (!ordered.length) {
      setNotice("Select at least one pilgrim first.");
      return;
    }
    setAutomationState("running");
    setNotice(
      "Keep the cursor in the first Name field. Move the mouse to the top-left corner to trigger PyAutoGUI failsafe.",
    );
    try {
      await request("/api/automation/run", {
        base: SERVICE,
        method: "POST",
        body: JSON.stringify({ profiles: ordered, ...automation }),
      });
      setAutomationState("complete");
      setNotice(
        "Autofill keystrokes completed. Review every field before continuing manually.",
      );
    } catch (error) {
      setAutomationState("error");
      setNotice(error.message);
    }
  }
  async function saveGeneral(event) {
    event.preventDefault();
    try {
      await request("/api/general", {
        base: SERVICE,
        method: "PUT",
        body: JSON.stringify(general),
      });
      setNotice("General Details saved locally.");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function fillGeneral() {
    setGeneralState("running");
    try {
      await request("/api/automation/general", {
        base: SERVICE,
        method: "POST",
        body: JSON.stringify({
          ...general,
          countdown: automation.countdown,
          typingInterval: automation.typingInterval,
        }),
      });
      setGeneralState("complete");
      setNotice(
        "General Details filled. Review them before starting pilgrim autofill.",
      );
    } catch (error) {
      setGeneralState("error");
      setNotice(error.message);
    }
  }
  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(label);
      setTimeout(() => setCopied(""), 1300);
    } catch {
      setNotice(
        "Clipboard access is unavailable. Select and copy the value manually.",
      );
    }
  }
  function toggleGroup(groupName) {
    const members = profiles.filter(
      (profile) => profile.groupName === groupName,
    );
    const allSelected =
      members.length > 0 &&
      members.every((profile) => selected.includes(profile.id));
    setSelected(
      allSelected
        ? selected.filter((id) => !members.some((profile) => profile.id === id))
        : [...new Set([...selected, ...members.map((profile) => profile.id)])],
    );
    setPrepared(false);
  }
  function renderProfileRow(profile) {
    return (
      <article className="profile-row" key={profile.id}>
        <input
          className="check"
          aria-label={`Select ${profile.name}`}
          type="checkbox"
          checked={selected.includes(profile.id)}
          onChange={(e) => {
            setSelected(
              e.target.checked
                ? [...selected, profile.id]
                : selected.filter((id) => id !== profile.id),
            );
            setPrepared(false);
          }}
        />
        <div className="avatar">
          {profile.name
            .split(/\s+/)
            .slice(0, 2)
            .map((x) => x[0])
            .join("")
            .toUpperCase()}
        </div>
        <div className="profile-info">
          <b>{profile.name}</b>
          <span>
            {profile.nickname || "Pilgrim"} · Age {profile.age} ·{" "}
            {profile.gender}
          </span>
        </div>
        <div className="id-badge">{profile.groupName || "Ungrouped"}</div>
        <button
          className="icon-btn"
          aria-label="Edit profile"
          onClick={() => startEdit(profile)}
        >
          Edit
        </button>
        <button
          className="icon-btn danger"
          aria-label="Delete profile"
          onClick={() => remove(profile.id)}
        >
          <Trash2 size={16} />
        </button>
      </article>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">PD</div>
          <div>
            <b>Pilgrim Desk</b>
            <small>Personal details manager</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active">
          <Users size={17} /> Pilgrims <span>{profiles.length}</span>
        </div>
        <div className="sidebar-bottom">
          <Users size={17} />
          <div>
            <b>Local Python service</b>
            <small>SQLite on this computer</small>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">LOCAL WORKSPACE</p>
            <h1>Your pilgrim profiles</h1>
          </div>
          <div className="vault-status">
            <span
              className={`status-dot ${serviceState === "offline" ? "offline" : ""}`}
            />
            {serviceState === "connected"
              ? "Python service connected"
              : serviceState === "connecting"
                ? "Connecting…"
                : "Python service offline"}
          </div>
        </header>
        {notice && (
          <div className="notice" onClick={() => setNotice("")}>
            {notice}
            <X size={15} />
          </div>
        )}
        {serviceState === "offline" && (
          <div className="storage-error">
            Start the local Python service using the instructions in README.md,
            then refresh this page.
          </div>
        )}
        <section className="stats-row">
          <div className="stat-card">
            <span>Saved profiles</span>
            <b>{profiles.length}</b>
          </div>
          <div className="stat-card">
            <span>Selected for review</span>
            <b>{selected.length}</b>
          </div>
          <div className="stat-card privacy">
            <span>Database</span>
            <b>Local SQLite</b>
          </div>
        </section>
        <section className="panel general-panel">
          <div className="panel-head">
            <div>
              <h2>General Details</h2>
              <p>Booking-level fields filled once before pilgrim details.</p>
            </div>
            <span className="count-pill">Local only</span>
          </div>
          <form className="general-grid" onSubmit={saveGeneral}>
            {[
              ["email", "Email"],
              ["city", "City"],
              ["state", "State"],
              ["country", "Country"],
              ["pincode", "Pincode"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={general[key]}
                  onChange={(e) =>
                    setGeneral({ ...general, [key]: e.target.value })
                  }
                  placeholder={label}
                />
              </label>
            ))}
            <div className="general-actions">
              <button className="secondary" type="submit">
                Save General Details
              </button>
              <button
                className="primary"
                type="button"
                disabled={generalState === "running"}
                onClick={fillGeneral}
              >
                {generalState === "running"
                  ? "Running countdown…"
                  : "Fill General Details"}
              </button>
            </div>
          </form>
        </section>
        <div className="content-grid">
          <section className="panel profile-panel">
            <div className="panel-head">
              <div>
                <h2>Pilgrim manager</h2>
                <p>Add and maintain details for your household.</p>
              </div>
              <button className="primary add-button" onClick={startAdd}>
                <Plus size={17} /> Add pilgrim
              </button>
            </div>
            <div className="view-toggle">
              <button
                className={viewMode === "group" ? "active" : ""}
                onClick={() => setViewMode("group")}
              >
                <Users size={15} /> By Group
              </button>
              <button
                className={viewMode === "individual" ? "active" : ""}
                onClick={() => setViewMode("individual")}
              >
                <Users size={15} /> Individual
              </button>
            </div>
            <label className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or nickname"
              />
            </label>
            <div className="profile-list">
              {viewMode === "group" ? (
                <>
                  {groupedProfiles.map(({ groupName, members }) => {
                    const visibleMembers = members.filter((profile) =>
                      `${profile.name} ${profile.nickname || ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    );
                    if (!visibleMembers.length) return null;
                    const allSelected = visibleMembers.every((profile) =>
                      selected.includes(profile.id),
                    );
                    return (
                      <div className="group-card" key={groupName}>
                        <button
                          className="group-card-head"
                          onClick={() => toggleGroup(groupName)}
                        >
                          <div>
                            <b>{groupName}</b>
                            <span>
                              {visibleMembers.length} pilgrim
                              {visibleMembers.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <span
                            className={`group-check ${allSelected ? "selected" : ""}`}
                          >
                            {allSelected ? "✓" : ""}
                          </span>
                        </button>
                        {visibleMembers.map(renderProfileRow)}
                      </div>
                    );
                  })}
                  {profiles
                    .filter(
                      (profile) =>
                        !profile.groupName &&
                        `${profile.name} ${profile.nickname || ""}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map(renderProfileRow)}
                </>
              ) : filtered.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">
                    <Users size={22} />
                  </div>
                  <b>
                    {profiles.length ? "No matches found" : "No profiles yet"}
                  </b>
                  <p>
                    {profiles.length
                      ? "Try another name."
                      : "Add your first pilgrim to prepare a booking checklist."}
                  </p>
                </div>
              ) : (
                filtered.map(renderProfileRow)
              )}
            </div>
          </section>
          <section className="panel prep-panel">
            <div className="panel-head">
              <div>
                <h2>Booking preparation</h2>
                <p>
                  Arrange the order, then use this as your manual entry
                  checklist.
                </p>
              </div>
              <span className="count-pill">{ordered.length} selected</span>
            </div>
            {ordered.length === 0 ? (
              <div className="prep-empty">
                Select pilgrims from the list to build a checklist.
              </div>
            ) : (
              <>
                <div className="ordered-list">
                  {ordered.map((p, i) => (
                    <div
                      className="ordered-person"
                      key={p.id}
                      draggable
                      onDragStart={() => setDraggedId(p.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        reorder(draggedId, p.id);
                        setDraggedId(null);
                      }}
                    >
                      <GripVertical className="drag-handle" size={15} />
                      <span className="order-num">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="ordered-name">
                        <b>{p.name}</b>
                        <small>
                          {p.age} years · {p.gender} · {p.idType}
                        </small>
                      </div>
                      <div className="move-buttons">
                        <button
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          aria-label="Move down"
                          disabled={i === ordered.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="manual-note">
                  <b>Automation safety</b>
                  <p>
                    Select each readonly dropdown during its pause. After Photo
                    ID Proof, click the Photo ID Number field during the
                    ID-field pause; the engine then types the number and
                    continues.
                  </p>
                </div>
                <div className="automation-settings">
                  <label>
                    Countdown (seconds)
                    <input
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      value={automation.countdown}
                      onChange={(e) =>
                        setAutomation({
                          ...automation,
                          countdown: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Dropdown pause (seconds)
                    <input
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      value={automation.dropdownPause}
                      onChange={(e) =>
                        setAutomation({
                          ...automation,
                          dropdownPause: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    ID field pause (seconds)
                    <input
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      value={automation.idFieldPause}
                      onChange={(e) =>
                        setAutomation({
                          ...automation,
                          idFieldPause: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Typing interval
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={automation.typingInterval}
                      onChange={(e) =>
                        setAutomation({
                          ...automation,
                          typingInterval: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Gender dropdown
                    <select
                      value={automation.genderMode}
                      onChange={(e) =>
                        setAutomation({
                          ...automation,
                          genderMode: e.target.value,
                        })
                      }
                    >
                      <option value="manual_pause">
                        Pause for manual selection
                      </option>
                      <option value="type_enter">Type text + Enter</option>
                      <option value="arrow_index">Home + arrow index</option>
                    </select>
                  </label>
                  <label>
                    Photo ID dropdown
                    <select
                      value={automation.idMode}
                      onChange={(e) =>
                        setAutomation({ ...automation, idMode: e.target.value })
                      }
                    >
                      <option value="manual_pause">
                        Pause for manual selection
                      </option>
                      <option value="type_enter">Type text + Enter</option>
                      <option value="arrow_index">Home + arrow index</option>
                    </select>
                  </label>
                  {automation.genderMode === "arrow_index" && (
                    <label>
                      Gender option index
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={automation.genderIndex}
                        onChange={(e) =>
                          setAutomation({
                            ...automation,
                            genderIndex: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  {automation.idMode === "arrow_index" && (
                    <label>
                      ID option index
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={automation.idIndex}
                        onChange={(e) =>
                          setAutomation({
                            ...automation,
                            idIndex: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                </div>
                <div className="automation-actions">
                  <button className="secondary" onClick={prepareAutofill}>
                    <ShieldCheck size={16} />{" "}
                    {prepared ? "Prepared" : "Prepare Autofill"}
                  </button>
                  <button
                    className="primary"
                    disabled={automationState === "running"}
                    onClick={startAutomation}
                  >
                    {automationState === "running"
                      ? "Running countdown…"
                      : "Start keyboard autofill"}
                  </button>
                </div>
                <div className="checklist">
                  {ordered.map((p, i) => (
                    <details key={p.id}>
                      <summary>
                        <span>{String(i + 1).padStart(2, "0")}</span> {p.name}
                        <small>Review details</small>
                      </summary>
                      <div className="detail-list">
                        {[
                          ["Name", p.name],
                          ["Age", p.age],
                          ["Gender", p.gender],
                          ["Photo ID Proof", p.idType],
                          ["Photo ID Number", p.idNumber],
                        ].map(([label, value]) => (
                          <div className="detail-line" key={label}>
                            <div>
                              <small>{label}</small>
                              <b>
                                {label === "Photo ID Number"
                                  ? `${String(value).slice(0, 2)}••••${String(value).slice(-2)}`
                                  : value}
                              </b>
                            </div>
                            {label === "Photo ID Number" ? (
                              <span className="masked-label">Masked</span>
                            ) : (
                              <button
                                className="copy-btn"
                                onClick={() => copy(value, `${p.id}-${label}`)}
                              >
                                {copied === `${p.id}-${label}` ? (
                                  <Check size={15} />
                                ) : (
                                  <Clipboard size={15} />
                                )}{" "}
                                {copied === `${p.id}-${label}`
                                  ? "Copied"
                                  : "Copy"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
        <footer>
          Local-only profile manager · Database is unencrypted on this computer.
        </footer>
      </main>
      {editing && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <form className="modal" onSubmit={save}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">PILGRIM PROFILE</p>
                <h2>{editing === "new" ? "Add a pilgrim" : "Edit pilgrim"}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditing(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label className="wide">
                Full name
                <input
                  autoFocus
                  required
                  maxLength="100"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="As shown on ID proof"
                />
              </label>
              <label>
                Age
                <input
                  required
                  type="number"
                  min="1"
                  max="120"
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  placeholder="Age"
                />
              </label>
              <label>
                Nickname <small>(optional)</small>
                <input
                  maxLength="40"
                  value={form.nickname}
                  onChange={(e) =>
                    setForm({ ...form, nickname: e.target.value })
                  }
                  placeholder="e.g. Amma"
                />
              </label>
              <label>
                Gender
                <select
                  required
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">Choose gender</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Transgender</option>
                </select>
              </label>
              <label>
                Photo ID proof
                <select
                  required
                  value={form.idType}
                  onChange={(e) => setForm({ ...form, idType: e.target.value })}
                >
                  <option value="">Choose ID type</option>
                  <option>Aadhaar</option>
                  <option>Voter ID</option>
                  <option>Passport</option>
                  <option>PAN</option>
                  <option>Driving Licence</option>
                </select>
              </label>
              <label className="wide">
                Photo ID number
                <input
                  required
                  maxLength="32"
                  autoComplete="off"
                  value={form.idNumber}
                  onChange={(e) =>
                    setForm({ ...form, idNumber: e.target.value })
                  }
                  placeholder="Stored in local SQLite"
                />
              </label>
            </div>
            <label className="group-tag-field">
              Family tag <small>(select existing or type a new one)</small>
              <select
                value={groups.includes(form.groupName) ? form.groupName : ""}
                onChange={(e) =>
                  setForm({ ...form, groupName: e.target.value })
                }
              >
                <option value="">Ungrouped</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <input
                maxLength="60"
                value={groups.includes(form.groupName) ? "" : form.groupName}
                onChange={(e) =>
                  setForm({ ...form, groupName: e.target.value })
                }
                placeholder="New family tag"
              />
            </label>
            <p className="privacy-note">
              <ShieldCheck size={15} /> ID numbers stay on this computer and
              remain masked in the review checklist.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                Save profile
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
