# Deploying (free, always-on, HTTPS)

Goal: run the addon on a free cloud VM with automatic HTTPS, so the network globe
in Stremio goes green and it works on your phone/TV — without your Mac being on.

Stack: **free VM** + **Docker Compose** (addon + Caddy) + **free DuckDNS hostname**.
Live seeders keep working because a real VM allows outbound UDP.

---

## 1. Put the code on GitHub

From this folder:

```bash
git init
git add -A
git commit -m "Initial commit"
gh repo create stremio-yts-addon --private --source=. --push   # or create a repo on github.com and push
```

You'll `git clone` this on the VM, and updating later is just `git pull`.

---

## 2. Get a free hostname (DuckDNS)

HTTPS certs need a hostname, not a bare IP.

1. Go to https://www.duckdns.org, sign in, create a subdomain, e.g. `your-addon`.
2. Leave the IP blank for now — you'll set it to the VM's IP in step 4.
3. Edit `Caddyfile` and replace `your-addon.duckdns.org` with your actual subdomain.

---

## 3. Create a free VM

Pick one (both are free; card required only for identity):

- **Oracle Cloud — Always Free:** create an "Always Free eligible" VM instance
  (Ubuntu 22.04). In the VCN **security list**, add ingress rules allowing TCP **80**
  and **443** from `0.0.0.0/0`. Oracle Ubuntu images also have a host firewall — run:
  ```bash
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```
- **Google Cloud — Always Free:** create an `e2-micro` VM (us-west1/us-central1/us-east1),
  Ubuntu 22.04, and check "Allow HTTP/HTTPS traffic" in the firewall section.

Note the VM's **public IP**, then set your DuckDNS subdomain to point to it (on
duckdns.org, paste the IP and hit "update ip").

---

## 4. Install Docker + run it on the VM

SSH into the VM, then:

```bash
# install docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# get the code
git clone https://github.com/<you>/stremio-yts-addon.git
cd stremio-yts-addon

# make sure Caddyfile has your real DuckDNS domain, then:
docker compose up -d --build
```

Caddy will fetch a cert automatically (takes ~30s the first time). Check logs with
`docker compose logs -f caddy` if needed.

---

## 5. Install in Stremio

Open this in Stremio (Addons → paste URL):

```
https://your-addon.duckdns.org/manifest.json
```

The globe should now be green, and it'll sync to your account / other devices.

---

## Updating the code later

Edit locally → push → pull + rebuild on the VM:

```bash
# on your Mac
git add -A && git commit -m "..." && git push

# on the VM
cd stremio-yts-addon && git pull && docker compose up -d --build
```

That's the whole update loop. (Want it fully automatic on `git push`? Ask me to add a
GitHub Action that SSHes in and redeploys.)

> Tip: bump `version` in `addon.js` when you change behavior, so Stremio treats it as an
> update. To force a refresh immediately, uninstall/re-add the addon in Stremio.
