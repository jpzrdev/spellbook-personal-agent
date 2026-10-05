def test_health_requires_token(client):
    no_token = {"Authorization": ""}
    assert client.get("/health", headers=no_token).status_code == 401
    assert client.get("/health", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["vault_exists"] is True
    assert resp.json()["language"] == "en"


def test_every_route_requires_token(client):
    for method, route in [("get", "/today"), ("get", "/tasks"), ("post", "/ask"), ("post", "/raw")]:
        resp = getattr(client, method)(route, headers={"Authorization": ""})
        assert resp.status_code == 401, route
