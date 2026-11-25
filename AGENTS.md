# Repository Guidelines

## Web Development

Implement Web features in `src/`. For M2, follow the [development plan](docs/development-plan-m2.md) for scope, task order, and acceptance cases. Use the [finalized M2 configuration](docs/m2-configuration.md) for gameplay data and the [Web design record](docs/web-port-design.md) for rule decisions. Follow the [post-M2 backlog](docs/post-m2-backlog.md) for F1–F3.

Implement the extracted content IDs, names, stats, complete bound skills, and progression defined by the M2 plan, finalized configuration, and resolved Web rules. Build the new Warcraft-style 3D terrain and integrate Warcraft models with textures and animations as specified in the plan's scope; record any approved model substitutions against content IDs. M1 sample content is historical and does not define M2 content. Run `npm run check` and the acceptance cases for the changed tasks; record implementation and acceptance status separately.

## Project Structure

`图鉴.xlsx` is the repository's primary artifact. Its eight Chinese-language worksheets organize game reference data. Start with `玩法总览` for an overview, then use the sheet dedicated to the data you are changing.

- Progression and game modes live in `主线波次` and `无尽与深渊`.
- Tower stats and skills live in `塔与属性` and `塔技能`.
- Items, crafting, and upgrade eligibility live in `装备与道具`, `合成配方`, and `变强资格`.

## Local Editing and Commands

Open `图鉴.xlsx` in Excel to edit the data directly, then save it as `.xlsx` under the same filename. Run both checks from the repository root before staging.

- `unzip -tq 图鉴.xlsx` checks the workbook's ZIP integrity after saving.
- `git status --short` shows which files you are about to include in your change. Stage the workbook and any intentionally updated documentation.

## Workbook Conventions

Follow the existing Chinese terminology, column order, units, and number formats. Add rows inside the relevant Excel table so its formatting and filters cover the new data. Preserve the sheet names, table headers, and frozen panes unless the change requires a layout update.

## Manual Validation

Reopen the saved workbook and review every edited sheet. Confirm the changed values match their source and that new rows appear when filtering the table. When changing a tower or item name, check related skill or recipe entries for the same spelling.

## Commits and Pull Requests

Use a short, action-oriented commit subject such as `Update tower skill costs`. In the pull request description, name the affected worksheets, summarize the data changes, and list the checks you ran. Link the relevant issue or reference source when available, and include a screenshot for layout changes.
