# Tennis Match Charting Project — ML experiments

Learning project: ML experiments on point-by-point pro tennis data from Jeff
Sackmann's **Tennis Match Charting Project** (MCP) — thousands of matches
charted shot-by-shot by volunteers.

- Dataset: https://github.com/JeffSackmann/tennis_MatchChartingProject
- Get it: `git clone` that repo into `data/` (or download the CSVs you need).
- The shot-coding scheme is documented in the dataset repo's `MatchChart.xlsm`
  instructions and at https://www.tennisabstract.com — read the coding docs
  before touching the point-level CSVs, they're dense.
- License note: the MCP data is CC BY-NC-SA 4.0 (non-commercial).

## Layout

```
ml/
├── data/        # raw dataset (not committed)
├── notebooks/   # exploratory notebooks
└── requirements.txt
```

Grow structure as needed (e.g. `src/` once notebook code is worth reusing).

## Setup

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Ground rules

AI assistants working anywhere under `ml/` follow the AI Agent Guidelines in
`CLAUDE.md`: teaching assistant, not code generator.

## Experiment log

Keep a short entry per experiment: question asked, approach, result, what was
learned. Nothing teaches like re-reading your own dead ends.

| Date | Question | Approach | Outcome |
|------|----------|----------|---------|
|      |          |          |         |
