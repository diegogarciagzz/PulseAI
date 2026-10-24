"""Fictional rosters for the two brand-kit clubs. All names are invented."""
from __future__ import annotations

from app.models.core import Player, Team


def _p(team: str, prefix: str, number: int, name: str, position: str, role: str, *,
       passing: float, shooting: float, defending: float, workrate: float, progression: float,
       starter: bool = True) -> Player:
    return Player(id=f"{prefix}{number:02d}", team=team, name=name, number=number, position=position, role=role,
                  passing=passing, shooting=shooting, defending=defending, workrate=workrate,
                  progression=progression, starter=starter)


NORTH_CITY = Team(
    id="north-city", name="North City FC", short="NCF", nickname="The Needles",
    primary_color="#27B8F5", secondary_color="#0B1F3F",
    players=[
        _p("north-city", "NCF", 1, "Jonas Vale", "GK", "Goalkeeper", passing=0.72, shooting=0.05, defending=0.8, workrate=0.4, progression=0.2),
        _p("north-city", "NCF", 2, "Emeka Dawson", "DF", "Right back", passing=0.78, shooting=0.2, defending=0.72, workrate=0.8, progression=0.55),
        _p("north-city", "NCF", 4, "Luka Brandt", "DF", "Centre back", passing=0.8, shooting=0.15, defending=0.86, workrate=0.6, progression=0.4),
        _p("north-city", "NCF", 5, "Samir Haddad", "DF", "Centre back", passing=0.76, shooting=0.12, defending=0.84, workrate=0.62, progression=0.35),
        _p("north-city", "NCF", 3, "Oliver Finch", "DF", "Left back", passing=0.77, shooting=0.2, defending=0.7, workrate=0.82, progression=0.6),
        _p("north-city", "NCF", 6, "Theo Marsh", "MF", "Defensive midfielder", passing=0.88, shooting=0.25, defending=0.78, workrate=0.9, progression=0.7),
        _p("north-city", "NCF", 8, "Rafa Okafor", "MF", "Central midfielder", passing=0.86, shooting=0.4, defending=0.6, workrate=0.85, progression=0.8),
        _p("north-city", "NCF", 10, "Mika Sorensen", "MF", "Attacking midfielder", passing=0.84, shooting=0.6, defending=0.35, workrate=0.7, progression=0.85),
        _p("north-city", "NCF", 7, "Dani Castellano", "FW", "Right winger", passing=0.74, shooting=0.66, defending=0.3, workrate=0.75, progression=0.82),
        _p("north-city", "NCF", 11, "Noah Petrov", "FW", "Left winger", passing=0.72, shooting=0.62, defending=0.3, workrate=0.74, progression=0.8),
        _p("north-city", "NCF", 9, "Kai Lindqvist", "FW", "Striker", passing=0.68, shooting=0.86, defending=0.2, workrate=0.65, progression=0.6),
        # bench
        _p("north-city", "NCF", 14, "Ibrahim Keita", "MF", "Central midfielder", passing=0.8, shooting=0.35, defending=0.62, workrate=0.8, progression=0.66, starter=False),
        _p("north-city", "NCF", 17, "Leo Marchetti", "FW", "Winger", passing=0.7, shooting=0.64, defending=0.25, workrate=0.78, progression=0.84, starter=False),
        _p("north-city", "NCF", 19, "Ansel Kuyt", "FW", "Striker", passing=0.62, shooting=0.78, defending=0.18, workrate=0.7, progression=0.55, starter=False),
        _p("north-city", "NCF", 15, "Caleb Nwosu", "DF", "Centre back", passing=0.74, shooting=0.1, defending=0.8, workrate=0.6, progression=0.3, starter=False),
        _p("north-city", "NCF", 12, "Bram Oosten", "GK", "Goalkeeper", passing=0.68, shooting=0.05, defending=0.74, workrate=0.4, progression=0.2, starter=False),
    ],
)

SOUTH_UNITED = Team(
    id="south-united", name="South United FC", short="SUF", nickname="The Arches",
    primary_color="#FF5B2E", secondary_color="#22262D",
    players=[
        _p("south-united", "SUF", 1, "Marcus Hale", "GK", "Goalkeeper", passing=0.7, shooting=0.05, defending=0.82, workrate=0.4, progression=0.2),
        _p("south-united", "SUF", 2, "Tomas Reiner", "DF", "Right back", passing=0.75, shooting=0.2, defending=0.74, workrate=0.78, progression=0.5),
        _p("south-united", "SUF", 5, "Declan Moore", "DF", "Centre back", passing=0.74, shooting=0.15, defending=0.88, workrate=0.6, progression=0.32),
        _p("south-united", "SUF", 4, "Yusuf Adeyemi", "DF", "Centre back", passing=0.76, shooting=0.18, defending=0.85, workrate=0.64, progression=0.36),
        _p("south-united", "SUF", 3, "Pablo Iriarte", "DF", "Left back", passing=0.78, shooting=0.22, defending=0.7, workrate=0.8, progression=0.62),
        _p("south-united", "SUF", 6, "Henrik Dahl", "MF", "Defensive midfielder", passing=0.84, shooting=0.3, defending=0.8, workrate=0.86, progression=0.6),
        _p("south-united", "SUF", 8, "Elias Ferreira", "MF", "Central midfielder", passing=0.86, shooting=0.45, defending=0.55, workrate=0.84, progression=0.78),
        _p("south-united", "SUF", 10, "Mateusz Król", "MF", "Playmaker", passing=0.9, shooting=0.58, defending=0.3, workrate=0.68, progression=0.88),
        _p("south-united", "SUF", 7, "Jamal Osei", "FW", "Right winger", passing=0.72, shooting=0.68, defending=0.28, workrate=0.76, progression=0.84),
        _p("south-united", "SUF", 11, "Arlo Beckett", "FW", "Left winger", passing=0.7, shooting=0.64, defending=0.3, workrate=0.74, progression=0.8),
        _p("south-united", "SUF", 9, "Viktor Lindgren", "FW", "Striker", passing=0.64, shooting=0.88, defending=0.2, workrate=0.66, progression=0.58),
        # bench
        _p("south-united", "SUF", 16, "Owen Blackwood", "MF", "Central midfielder", passing=0.8, shooting=0.4, defending=0.6, workrate=0.8, progression=0.7, starter=False),
        _p("south-united", "SUF", 18, "Ciro Mancini", "FW", "Winger", passing=0.7, shooting=0.66, defending=0.25, workrate=0.8, progression=0.86, starter=False),
        _p("south-united", "SUF", 20, "Bakary Touré", "FW", "Striker", passing=0.6, shooting=0.8, defending=0.18, workrate=0.72, progression=0.56, starter=False),
        _p("south-united", "SUF", 15, "Ruben Alves", "DF", "Centre back", passing=0.72, shooting=0.1, defending=0.8, workrate=0.6, progression=0.3, starter=False),
        _p("south-united", "SUF", 13, "Finn Aldridge", "GK", "Goalkeeper", passing=0.66, shooting=0.05, defending=0.74, workrate=0.4, progression=0.2, starter=False),
    ],
)

TEAMS: dict[str, Team] = {"north-city": NORTH_CITY, "south-united": SOUTH_UNITED}


def player_index() -> dict[str, Player]:
    return {p.id: p for team in TEAMS.values() for p in team.players}


def find_player_by_name(name: str) -> Player | None:
    needle = name.strip().lower()
    for p in player_index().values():
        full = p.name.lower()
        if needle == full or needle == full.split()[-1] or needle == full.split()[0]:
            return p
    return None
