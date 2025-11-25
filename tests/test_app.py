import copy
import pytest
from fastapi.testclient import TestClient
from src.app import app, activities

client = TestClient(app)

@pytest.fixture(autouse=True)
def restore_state():
    # Deep copy original activities to restore after each test
    original = copy.deepcopy(activities)
    yield
    # Clear and repopulate to original to avoid retaining mutations
    for k in list(activities.keys()):
        activities[k] = original[k]


def test_root_redirect():
    resp = client.get("/", follow_redirects=False)
    # FastAPI RedirectResponse defaults to 307
    assert resp.status_code in (307, 302)
    assert resp.headers["location"].endswith("/static/index.html")


def test_get_activities_lists_expected_keys():
    resp = client.get("/activities")
    assert resp.status_code == 200
    data = resp.json()
    # Check presence of a few known activities
    for expected in ["Chess Club", "Programming Class", "Gym Class"]:
        assert expected in data
    # Structure sanity
    chess = data["Chess Club"]
    assert "description" in chess and "participants" in chess


def test_signup_adds_participant_and_duplicate_fails():
    email = "testuser_unique@mergington.edu"
    activity = "Chess Club"
    # Ensure not present initially
    assert email not in activities[activity]["participants"]
    resp = client.post(f"/activities/{activity}/signup", params={"email": email})
    assert resp.status_code == 200
    assert email in activities[activity]["participants"]
    # Duplicate signup should 400
    resp_dup = client.post(f"/activities/{activity}/signup", params={"email": email})
    assert resp_dup.status_code == 400
    body_dup = resp_dup.json()
    assert "already" in body_dup["detail"].lower()


def test_unregister_flow():
    activity = "Programming Class"
    email = "temp_remove@mergington.edu"
    # Sign up first
    resp_signup = client.post(f"/activities/{activity}/signup", params={"email": email})
    assert resp_signup.status_code == 200
    assert email in activities[activity]["participants"]
    # Delete
    resp_del = client.delete(f"/activities/{activity}/participants/{email}")
    assert resp_del.status_code == 200
    assert email not in activities[activity]["participants"]
    # Delete again should 404
    resp_del_again = client.delete(f"/activities/{activity}/participants/{email}")
    assert resp_del_again.status_code == 404
    body = resp_del_again.json()
    assert "not registered" in body["detail"].lower()


def test_signup_invalid_activity_returns_404():
    resp = client.post("/activities/Unknown%20Club/signup", params={"email": "x@mergington.edu"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_delete_invalid_activity_returns_404():
    resp = client.delete("/activities/Nope/participants/someone%40mergington.edu")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_capacity_limit_enforced_with_temporary_lower_max():
    activity = "Programming Class"
    # Temporarily shrink capacity to current size + 1 to reach full quickly
    current_count = len(activities[activity]["participants"])
    original_max = activities[activity]["max_participants"]
    activities[activity]["max_participants"] = current_count + 1

    try:
        # First signup should succeed (fills to max)
        email_ok = "fill_slot@mergington.edu"
        assert email_ok not in activities[activity]["participants"]
        r1 = client.post(f"/activities/{activity}/signup", params={"email": email_ok})
        assert r1.status_code == 200
        # Next signup should fail due to capacity
        email_full = "over_capacity@mergington.edu"
        r2 = client.post(f"/activities/{activity}/signup", params={"email": email_full})
        assert r2.status_code == 400
        assert "full" in r2.json()["detail"].lower()
    finally:
        # restore original max; outer fixture will restore whole dict after test
        activities[activity]["max_participants"] = original_max


def test_delete_wrong_activity_returns_404():
    # Sign up email to Chess Club, then try deleting from Programming Class
    email = "cross_club@mergington.edu"
    r1 = client.post("/activities/Chess%20Club/signup", params={"email": email})
    assert r1.status_code == 200
    # Attempt delete from another activity should 404
    r2 = client.delete("/activities/Programming%20Class/participants/" + email)
    assert r2.status_code == 404
    assert "not registered" in r2.json()["detail"].lower()


def test_case_insensitive_emails_treated_as_distinct():
    activity = "Gym Class"
    e1 = "CaseUser@mergington.edu"
    e2 = "caseuser@mergington.edu"
    # Sign up both; current app treats emails as exact string match
    r1 = client.post(f"/activities/{activity}/signup", params={"email": e1})
    assert r1.status_code == 200
    r2 = client.post(f"/activities/{activity}/signup", params={"email": e2})
    assert r2.status_code == 200
    assert e1 in activities[activity]["participants"]
    assert e2 in activities[activity]["participants"]


def test_whitespace_emails_treated_as_distinct():
    activity = "Science Club"
    with_space = "  spaced@mergington.edu  "
    trimmed = "spaced@mergington.edu"
    r1 = client.post(f"/activities/{activity}/signup", params={"email": with_space})
    assert r1.status_code == 200
    r2 = client.post(f"/activities/{activity}/signup", params={"email": trimmed})
    assert r2.status_code == 200
    assert with_space in activities[activity]["participants"]
    assert trimmed in activities[activity]["participants"]


def test_capacity_full_at_boundary():
    activity = "Debate Team"
    # Set max equal to current count so that the next signup is rejected
    current_count = len(activities[activity]["participants"])
    original_max = activities[activity]["max_participants"]
    activities[activity]["max_participants"] = current_count
    try:
        resp = client.post(f"/activities/{activity}/signup", params={"email": "boundary@mergington.edu"})
        assert resp.status_code == 400
        assert "full" in resp.json()["detail"].lower()
    finally:
        activities[activity]["max_participants"] = original_max
