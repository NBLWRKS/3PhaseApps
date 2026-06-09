# Pushing this project to your GitHub repo

This folder is already an initialized git repository with one commit on the
`main` branch. To put it on GitHub:

## 1. Create an empty repo on GitHub
Go to https://github.com/new, name it (e.g. `3phase-conveyor`), and create it
**without** a README, .gitignore, or license (this project already has them).

## 2. Connect your repo and push
From inside this folder, run (replace the URL with your repo's):

```bash
# HTTPS
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

or with SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If you already initialized the GitHub repo with files, run
`git pull --rebase origin main` before pushing, or force with care.

## 3. Authentication
- **HTTPS**: when prompted for a password, use a Personal Access Token
  (GitHub → Settings → Developer settings → Personal access tokens), not your
  account password.
- **SSH**: make sure your SSH key is added to GitHub (Settings → SSH keys).

That's it. Once pushed, you can connect the repo to Render via
**New → Blueprint** (it reads `render.yaml`). See `README.md` for deployment.
