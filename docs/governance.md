# Governance: Branching & PR Policy

## 1) Branching Model

### Protected branches

- `main`: production-ready code only. No direct pushes allowed.
- `dev`: integration branch for completed features before release.
- `dev-team`: team-level integration branch for collaborative development and review before merging into `dev`.

### Development flow

```
feature/* → dev-team → dev → main
```

- Developers branch from `dev-team`
- Open PR into `dev-team` for team review
- After team approval, `dev-team` is merged into `dev`
- After testing & stabilization, `dev` is merged into `main` for release

---

## 2) Branch Naming

Use the following patterns:

- `feature/FUL-<issue-number>-<short-description>` (new feature)
- `fix/FUL-<issue-number>-<short-description>` (bugfix)
- `chore/FUL-<issue-number>-<short-description>` (maintenance)
- `docs/FUL-<issue-number>-<short-description>` (documentation)

### Examples

- `feature/FUL-11-frontend-auth-guards`
- `fix/FUL-12-user-authentication`
- `chore/FUL-13-update-dependencies`
- `docs/FUL-14-api-documentation`

### Rules

- Use lowercase kebab-case for descriptions
- One branch per issue
- Branch from `dev-team`, not `dev` or `main`

---

## 3) Pull Request Rules

All changes must be merged via Pull Request.

### Target branches

- Feature branches → `dev-team`
- Integration PRs → `dev` (from `dev-team` only)
- Release PRs → `main` (from `dev` only)

### PR must include

- Linked issue (e.g., `FUL-13`)
- Summary of changes
- Testing steps
- Screenshots if UI changes

### Required before merge

- CI must pass (backend + frontend jobs)
- At least 1 approval (team lead)
- PR must be up-to-date with target branch
- All review comments resolved

---

## 4) Merge Strategy

- Use **Squash and Merge** for feature PRs into `dev-team`
- Use **Merge commit** when promoting `dev-team` → `dev` (to preserve team history)
- Use **Merge commit** when promoting `dev` → `main` (to preserve release history)
- Delete branch after merge

Commit message format:

```
FUL-13: Implement CI workflow checks
```

---

## 5) Definition of Done (PR)

A PR is ready when:

- CI green ✅
- Review approved ✅
- Issue linked ✅
- Clear testing instructions provided ✅

---

## 6) Project Structure

### Backend

- `backend-nexus/app`: FastAPI application code

### Frontend

- `frontend-nexus/src`: React application code and components

---

## 7) CI/CD Expectations

- CI runs linting and tests for both backend and frontend
- Secrets / environment variables must be stored in GitHub Actions Secrets
- Never commit `.env` files or credentials
- Run tests locally before opening a PR

---

## 8) Branch Protection Rules (Enforced in GitHub)

For `main`:

- Require pull request before merging
- Require CI status checks to pass
- Require at least 1 approval
- Prevent direct pushes

For `dev`:

- Require CI checks before merge
- Allow merges only via PR

For `dev-team`:

- Require CI checks before merge
- Allow merges only via PR
- At least 1 approval from a team member
