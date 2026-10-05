def test_health_requires_token(client):
    sem_token = {"Authorization": ""}
    assert client.get("/health", headers=sem_token).status_code == 401
    assert client.get("/health", headers={"Authorization": "Bearer errado"}).status_code == 401


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["vault_existe"] is True


def test_todas_as_rotas_exigem_token(client):
    for metodo, rota in [("get", "/hoje"), ("get", "/tarefas"), ("post", "/ask"), ("post", "/raw")]:
        resp = getattr(client, metodo)(rota, headers={"Authorization": ""})
        assert resp.status_code == 401, rota
