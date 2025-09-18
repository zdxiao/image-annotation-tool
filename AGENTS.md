# Repository Guidelines

## Project Structure & Module Organization
Keep production code inside `src/`, grouped by feature (for example `src/agents/`, `src/tools/`, `src/runtime/`). Shared helpers live in `src/common/`. Mirror the runtime layout under `tests/` (for example `tests/agents/test_scheduler.py`) to keep fixtures easy to find. Non-code documentation belongs in `docs/`, and automation assets (datasets, prompts, fixtures) should sit under `assets/` with self-describing folder names.

## Build, Test, and Development Commands
Create a virtual environment before contributing:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```
Use `make` (or equivalent task runner) to consolidate common workflows:
- `make format` – run linters and auto-formatters.
- `make test` – execute the full test suite.
- `make lint` – run static analysis without touching files.
Document any new command in `README.md` and expose it through the Makefile.

## Coding Style & Naming Conventions
Follow PEP 8 with 4-space indentation. Modules and functions use `snake_case`; classes use `PascalCase`; constants use `UPPER_SNAKE_CASE`. Keep files under 400 lines by extracting helpers. Run `ruff --fix` and `black src tests` before opening a pull request, and add a pre-commit hook when possible.

## Testing Guidelines
Write `pytest` tests alongside the code they validate, using descriptive names such as `test_agent_handles_retry`. Provide regression coverage when fixing bugs. Prefer `pytest.mark.parametrize` for scenario coverage and keep integration tests labelled with `@pytest.mark.integration`. If a change lacks automated coverage, explain why in the pull request.

## Commit & Pull Request Guidelines
Commit messages follow the imperative mood (`Add retry backoff for planner`). Group related changes per commit to keep diffs reviewable. Every pull request should include: a summary of the change, links to relevant issues, test evidence (command output or screenshots), and a checklist of follow-up tasks if applicable. Flag breaking changes in the title and coordinate releases through tags.

## Security & Configuration Tips
Store credentials outside the repo. Ship redacted defaults via `.env.example` and load them with a configuration layer inside `src/runtime/config.py`. Rotate tokens regularly, and document any required secrets in the pull request checklist.
