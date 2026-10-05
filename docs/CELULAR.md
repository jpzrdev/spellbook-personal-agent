# Gandalf no celular (Tailscale)

O Bridge continua escutando só em `127.0.0.1` (ninguém da rede local ou da internet acessa). O **Tailscale** cria uma rede privada entre os seus aparelhos e publica o Gandalf **com HTTPS** só para eles. HTTPS é necessário para o microfone (voz) funcionar no navegador do celular.

## 1. Instalar o Tailscale (uma vez)

1. No PC: baixe em https://tailscale.com/download e entre com a sua conta (Google, Microsoft…).
2. No celular: instale o app Tailscale e entre **com a mesma conta**.
3. No painel (https://login.tailscale.com/admin/dns): deixe ligados **MagicDNS** e **HTTPS Certificates**.

## 2. Subir o Gandalf no modo de uso

No PC, na pasta do projeto:

```
powershell -File scripts/servir.ps1
```

Ele compila o HUD e sobe o Bridge servindo tudo em `http://127.0.0.1:8787`.

## 3. Publicar para os seus aparelhos

Em outro terminal no PC:

```
tailscale serve --bg 8787
```

O comando mostra um endereço como `https://seu-pc.algum-nome.ts.net`. Ele só abre em aparelhos logados na sua conta Tailscale.

- Para ver o que está publicado: `tailscale serve status`
- Para parar de publicar: `tailscale serve --https=443 off`

> **Não use `tailscale funnel`**: ele publica na internet aberta.

## 4. No celular

1. Abra o endereço `https://…ts.net` no navegador (Chrome no Android, Safari no iPhone).
2. Instale como app: **Adicionar à tela inicial** (Android: menu ⋮ → Instalar app; iPhone: Compartilhar → Adicionar à Tela de Início).
3. Na primeira vez que segurar o botão de voz, permita o microfone.

## Segurança

- O token do Bridge vai dentro do HUD compilado. Por isso o HUD só deve ficar acessível pela sua rede Tailscale (nunca exponha a porta 8787 nem use funnel).
- O PC precisa estar ligado com o Gandalf rodando (as rotinas também dependem disso).
- Se perder o celular: remova o aparelho em https://login.tailscale.com/admin/machines e troque o `BRIDGE_TOKEN` no `.env` (depois rode `scripts/servir.ps1` de novo).
