# Run the hosted demo server on InstaBox

This page sets up `apps/hosted` (`@passwerk/hosted`, ADR D-047) on an InstaBox machine so the
Claude Code CLI on your laptop can call it over HTTPS and see long tool calls as MCP tasks. It
is a demo deployment with one static bearer token. It is not production and it is not offline
(ADR D-019). Production on a hardened VPS with OAuth is Phase 9b.

The machine this page was measured on runs Debian 13 (x86_64) with Docker 29 under systemd,
`sudo`, `git`, and a user in the `docker` group. You do not need `npx instabox` for any step.
Everything runs in the machine's browser terminal and in the InstaBox dashboard.

## Security rules for this demo

- Create the token on the machine. Never paste it into a chat, an issue, a commit, or a
  screenshot.
- Keep the token in one root-owned file, `/etc/passwerk/hosted.env`, with mode `600`. Never
  put it in the repository or in a `.env` file inside the checkout.
- Bind the container's port to `127.0.0.1` on the machine. The InstaBox proxy reaches the
  machine on `127.0.0.1:8080` (measured), so no other interface needs the port.
- On the laptop, add the server with `--scope local`, so the token lands in your own
  `~/.claude.json` and never in the repository's `.mcp.json`.
- Unpublish the port and remove the container after the interview.

Anyone in the `docker` group can read the token with `docker inspect passwerk-hosted`, because
the `docker` group is equivalent to root. On a single-user demo machine that is acceptable. The
`600` file mode keeps the token away from every other account and from accidental `cat`.

## 1. Get the code

In the machine's browser terminal, clone the branch or tag you want to demo:

```sh
git clone --depth 1 --branch <branch-or-tag> https://github.com/ShahriarBijoy/passwerk.git
cd passwerk
```

## 2. Build the image

```sh
docker build -f apps/hosted/Dockerfile -t passwerk-hosted .
```

The build stage installs the workspace from `pnpm-lock.yaml`, runs `pnpm build`, and deploys
only `@passwerk/hosted` with its production dependencies. The runtime image is distroless
Node 22 and runs as the `nonroot` user with no shell.

## 3. Create the token on the machine

```sh
sudo install -d -m 700 -o root -g root /etc/passwerk
sudo sh -c 'umask 077 && printf "PASSWERK_AUTH_TOKEN=%s\n" "$(openssl rand -hex 32)" > /etc/passwerk/hosted.env'
sudo stat -c '%a %U %n' /etc/passwerk/hosted.env
```

The last command must print `600 root /etc/passwerk/hosted.env`. The token never appears on
screen in this step. `openssl rand -hex 32` gives 64 hex characters, which meets the server's
32-character minimum. If `openssl` is missing, install it with `sudo apt-get install -y openssl`.

## 4. Run the container

```sh
sudo docker run -d --name passwerk-hosted --restart unless-stopped \
  --env-file /etc/passwerk/hosted.env -e HOST=0.0.0.0 \
  -p 127.0.0.1:8080:8080 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 256 --memory 2g \
  passwerk-hosted
```

This command needs `sudo` because the Docker CLI reads `--env-file` as the calling user, and
only root can read the file. The flags do the following:

- `--restart unless-stopped` starts the container again when Docker starts. Docker is enabled
  under systemd, so a reboot or a resumed machine brings the server back.
- `-e HOST=0.0.0.0` makes the server listen on the container's own interface, where the port
  forward arrives. The image already sets it, and the flag keeps the command readable.
- `-p 127.0.0.1:8080:8080` publishes the port on the machine's loopback address only, where the
  InstaBox proxy connects.
- `--read-only`, `--cap-drop ALL`, and `--security-opt no-new-privileges` give the process a
  read-only root file system, no Linux capabilities, and no way to gain privileges.
- `--pids-limit 256` and `--memory 2g` cap processes and memory on the shared 8 GiB machine.

Check the server on the machine:

```sh
curl -fsS http://127.0.0.1:8080/healthz
sudo docker logs passwerk-hosted
```

If the container exits at once, read the logs. A missing or short `PASSWERK_AUTH_TOKEN` stops
the process before it listens.

## 5. Publish the port

In the InstaBox dashboard, open the **Ports** tab and publish port `8080`. The public URL has
the form `https://8080-<id>.instabox.tech`. Keep the real URL out of the repository.

From the laptop, check that the proxy reaches the server and that `/mcp` refuses a request
without the token:

```sh
curl -fsS https://8080-<id>.instabox.tech/healthz
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://8080-<id>.instabox.tech/mcp
```

The first command prints the health JSON. The second prints `401`.

## 6. Move the token to the laptop

1. In the machine's browser terminal, run `sudo cat /etc/passwerk/hosted.env`.
2. Copy only the value after `PASSWERK_AUTH_TOKEN=`.
3. Run `clear` in the browser terminal.
4. On the laptop, read the value into a variable without echoing it, in the directory where
   you will run the demo.

   In Git Bash, macOS, or Linux:

   ```sh
   read -rs PASSWERK_DEMO_TOKEN
   ```

   In PowerShell 7:

   ```powershell
   $env:PASSWERK_DEMO_TOKEN = Read-Host -MaskInput 'token'
   ```

5. Clear the clipboard. On Windows, also delete the entry from clipboard history (`Win+V`).

## 7. Add the server to Claude Code

In the same shell and directory:

```sh
claude mcp add --transport http --scope local passwerk-demo https://8080-<id>.instabox.tech/mcp --header "Authorization: Bearer $PASSWERK_DEMO_TOKEN"
```

In PowerShell, write `$env:PASSWERK_DEMO_TOKEN` in place of `$PASSWERK_DEMO_TOKEN`. The shell
expands the variable, so your shell history holds the variable name, not the token.

`--scope local` stores the entry, header included, in your `~/.claude.json` under this
project's path. Claude Code loads it only when you start it in this directory. It never
writes the entry to the repository's `.mcp.json`, which is committed. Do not use
`--scope project`.

Start `claude` in that directory and run `/mcp` to see `passwerk-demo` connected. Then close
the shell, or remove the variable with `unset PASSWERK_DEMO_TOKEN` (PowerShell:
`Remove-Item Env:PASSWERK_DEMO_TOKEN`).

## Rotate the token

Rotate after every interview, and at once if the token appeared anywhere it should not.

```sh
sudo sh -c 'umask 077 && printf "PASSWERK_AUTH_TOKEN=%s\n" "$(openssl rand -hex 32)" > /etc/passwerk/hosted.env'
sudo docker rm -f passwerk-hosted
```

Then run the `docker run` command from step 4 again. The old token stops working when the old
container is gone. On the laptop, remove the old entry with
`claude mcp remove passwerk-demo --scope local` and repeat steps 6 and 7.

## Update the code

```sh
git pull
docker build -f apps/hosted/Dockerfile -t passwerk-hosted .
sudo docker rm -f passwerk-hosted
```

Then run the `docker run` command from step 4 again. The token file stays as it is.

## After the interview

1. In the InstaBox dashboard, unpublish port `8080`.
2. Remove the container, so it does not start again on the next boot:

   ```sh
   sudo docker rm -f passwerk-hosted
   ```

3. Delete the token file with `sudo rm /etc/passwerk/hosted.env`, or rotate it before the next
   demo.
4. On the laptop, run `claude mcp remove passwerk-demo --scope local`.

## Measured limits of the InstaBox proxy

Measured on 2026-10-24 from the laptop against a free `standard-medium` machine.

- The proxy answers `502` when the first byte of a response takes more than about 20 s.
  Responses at 10 s and 18 s came back `200`. At 22 s, 30 s, and 65 s the proxy gave up after
  20.7 to 20.9 s. A task answer goes out at once, so the task path stays far below the limit. A
  plain tool result that takes longer than 20 s fails unless the server sends an early byte.
- Once the first byte is out, a stream survives 25 s of silence and ran for 76 s. The proxy
  does not buffer server-sent events.
- The proxy rewrites `Host` to `127.0.0.1:8080` and adds `X-Forwarded-For`,
  `X-Forwarded-Host`, and `X-Forwarded-Proto: https`. It passes `Authorization`, `Origin`, and
  POST bodies unchanged. The server must not check `Host` against the public name. The bearer
  token is the access control.
- A round trip from the laptop took 0.75 to 0.80 s over 10 calls.
- The free plan pauses the machine after 30 idle minutes or after 8 running hours. A paused
  machine answers `503` ("Sandbox offline") and a request does not wake it. Resume keeps the
  running container, and `/healthz` answered on the first try after it.
- A reboot from inside the machine (`sudo systemctl reboot`) stops it: the URL answers `502`
  and then `503` until you press **Start** in the dashboard. After Start, the container came
  back on its own and `/healthz` answered within 5 s, because Docker restarts it on boot.
- Start or resume the machine 15 minutes before the demo and check `/healthz` through the
  public URL. If the check fails, run `sudo docker start passwerk-hosted` on the machine.
