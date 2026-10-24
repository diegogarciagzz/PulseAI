"""Scenario scripts. A scenario steers a stateful simulation: it never writes events
directly. It sets per-window attacking intensity for each team, schedules the goals
that define the story, schedules substitutions and optionally boosts a player's
involvement (the Hidden Hero)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class IntensityWindow:
    start_minute: int
    end_minute: int
    home: float  # 0.2 (passive) .. 1.0 (relentless)
    away: float


@dataclass(frozen=True)
class ScheduledGoal:
    minute: int
    team: str
    scorer: str  # player id
    assist: str | None = None
    note: str = ""


@dataclass(frozen=True)
class ScheduledSub:
    minute: int
    team: str
    player_out: str
    player_in: str


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    description: str
    seed: int
    home: str = "north-city"
    away: str = "south-united"
    windows: list[IntensityWindow] = field(default_factory=list)
    goals: list[ScheduledGoal] = field(default_factory=list)
    subs: list[ScheduledSub] = field(default_factory=list)
    player_boost: dict[str, float] = field(default_factory=dict)
    demo_moments: list[dict] = field(default_factory=list)

    def intensity(self, minute: float) -> tuple[float, float]:
        for w in self.windows:
            if w.start_minute <= minute < w.end_minute:
                return w.home, w.away
        return 0.5, 0.5


COMEBACK = Scenario(
    key="comeback",
    title="The Comeback",
    description="South United race into a two-goal lead; North City rebuild after the break and turn it around.",
    seed=20261,
    windows=[
        IntensityWindow(0, 15, 0.45, 0.7),
        IntensityWindow(15, 30, 0.4, 0.75),
        IntensityWindow(30, 45, 0.55, 0.6),
        IntensityWindow(45, 55, 0.75, 0.45),
        IntensityWindow(55, 70, 0.9, 0.35),
        IntensityWindow(70, 80, 0.7, 0.5),
        IntensityWindow(80, 90, 0.85, 0.4),
    ],
    goals=[
        ScheduledGoal(18, "south-united", "SUF09", "SUF10", "Lindgren finishes a Król through ball"),
        ScheduledGoal(41, "south-united", "SUF07", "SUF08", "Osei cuts inside and scores"),
        ScheduledGoal(58, "north-city", "NCF09", "NCF10", "Lindqvist pulls one back"),
        ScheduledGoal(71, "north-city", "NCF07", "NCF08", "Castellano levels it"),
        ScheduledGoal(84, "north-city", "NCF09", "NCF07", "Lindqvist completes the turnaround"),
    ],
    subs=[
        ScheduledSub(46, "north-city", "NCF11", "NCF17"),
        ScheduledSub(63, "south-united", "SUF11", "SUF18"),
        ScheduledSub(76, "north-city", "NCF08", "NCF14"),
    ],
    demo_moments=[
        {"label": "SUF 2-0", "minute": 41},
        {"label": "Momentum turns", "minute": 55},
        {"label": "NCF 2-2", "minute": 71},
        {"label": "NCF 3-2", "minute": 84},
    ],
)

MOMENTUM_PARADOX = Scenario(
    key="momentum-paradox",
    title="The Momentum Paradox",
    description="South United dominate territory, shots and pressure for long spells, yet North City win it on the counter.",
    seed=20262,
    windows=[
        IntensityWindow(0, 10, 0.5, 0.6),
        IntensityWindow(10, 45, 0.45, 0.88),
        IntensityWindow(45, 60, 0.42, 0.92),
        IntensityWindow(60, 75, 0.45, 0.85),
        IntensityWindow(75, 90, 0.52, 0.78),
    ],
    goals=[
        ScheduledGoal(27, "north-city", "NCF11", "NCF06", "Petrov finishes a counter launched by Marsh"),
        ScheduledGoal(67, "south-united", "SUF09", "SUF10", "Lindgren finally beats Vale"),
        ScheduledGoal(79, "north-city", "NCF09", "NCF07", "Lindqvist punishes a rare lapse"),
    ],
    subs=[
        ScheduledSub(60, "south-united", "SUF11", "SUF18"),
        ScheduledSub(70, "south-united", "SUF06", "SUF16"),
        ScheduledSub(74, "north-city", "NCF10", "NCF14"),
    ],
    demo_moments=[
        {"label": "NCF 1-0 counter", "minute": 27},
        {"label": "SUF pressure peak", "minute": 52},
        {"label": "SUF 1-1", "minute": 67},
        {"label": "NCF 2-1", "minute": 79},
    ],
)

HIDDEN_HERO = Scenario(
    key="hidden-hero",
    title="The Hidden Hero",
    description="Theo Marsh never scores, but his recoveries and progressive passing run the whole North City performance.",
    seed=20263,
    windows=[
        IntensityWindow(0, 20, 0.6, 0.55),
        IntensityWindow(20, 45, 0.7, 0.5),
        IntensityWindow(45, 65, 0.65, 0.6),
        IntensityWindow(65, 90, 0.75, 0.45),
    ],
    goals=[
        ScheduledGoal(24, "north-city", "NCF07", "NCF06", "Castellano scores from a Marsh pass"),
        ScheduledGoal(52, "south-united", "SUF10", "SUF07", "Król equalises"),
        ScheduledGoal(77, "north-city", "NCF09", "NCF10", "Lindqvist wins it after Marsh regains possession"),
    ],
    subs=[
        ScheduledSub(61, "south-united", "SUF11", "SUF18"),
        ScheduledSub(80, "north-city", "NCF11", "NCF17"),
    ],
    player_boost={"NCF06": 2.2},
    demo_moments=[
        {"label": "NCF 1-0", "minute": 24},
        {"label": "SUF 1-1", "minute": 52},
        {"label": "Marsh pressing spell", "minute": 68},
        {"label": "NCF 2-1", "minute": 77},
    ],
)

SCENARIOS: dict[str, Scenario] = {s.key: s for s in (COMEBACK, MOMENTUM_PARADOX, HIDDEN_HERO)}
