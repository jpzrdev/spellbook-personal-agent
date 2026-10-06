# Gandalf on the phone (Tailscale)

The Bridge keeps listening only on `127.0.0.1` (nobody on the local network or the internet can reach it). **Tailscale** creates a private network between your devices and publishes Gandalf **over HTTPS** only to them. HTTPS is required for the microphone (voice) to work in the phone's browser.

## 1. Install Tailscale (once)

1. On the PC: download it from https://tailscale.com/download and sign in with your account (Google, Microsoft…).
2. On the phone: install the Tailscale app and sign in **with the same account**.
3. In the admin panel (https://login.tailscale.com/admin/dns): keep **MagicDNS** and **HTTPS Certificates** on.

## 2. Start Gandalf in daily-use mode

On the PC, in the project folder:

```
powershell -File scripts/serve.ps1
```

It builds the HUD and starts the Bridge serving everything at `http://127.0.0.1:8787`.

## 3. Publish it to your devices

In another terminal on the PC:

```
tailscale serve --bg 8787
```

The command shows an address like `https://your-pc.some-name.ts.net`. It only opens on devices logged into your Tailscale account.

- To see what is published: `tailscale serve status`
- To stop publishing: `tailscale serve --https=443 off`

> **Don't use `tailscale funnel`**: it publishes to the open internet.

## 4. On the phone

1. Open the `https://…ts.net` address in the browser (Chrome on Android, Safari on iPhone).
2. Install it as an app: **Add to Home Screen** (Android: ⋮ menu → Install app; iPhone: Share → Add to Home Screen).
3. The first time you hold the voice button, allow the microphone.

## Security

- The Bridge token goes inside the built HUD. That's why the HUD should only be reachable through your Tailscale network (never expose port 8787 or use funnel).
- The PC must be on with Gandalf running (the routines depend on it too).
- If you lose the phone: remove the device at https://login.tailscale.com/admin/machines and change `BRIDGE_TOKEN` in the `.env` (then run `scripts/serve.ps1` again).
