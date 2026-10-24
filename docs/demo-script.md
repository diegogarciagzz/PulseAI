# Demo script (target 110 to 115 seconds)

Setup before recording: backend and frontend running, browser at 1440 x 900 on http://127.0.0.1:5173, scenario **The Comeback**, replay reset (press the reset button).

| Time | Screen | Action | Say |
| --- | --- | --- | --- |
| 0:00 to 0:20 | Live Match | Press **Start replay**, select **120x**. Let the clock run past 18' (SUF goal) and 41' (0-2). | "PULSE AI turns a synthetic match into a living signal. North City versus South United, both fictional. Score, clock, statistics and the pitch map all come from one event log. Every statistic you see is computed server-side from those events." |
| 0:20 to 0:45 | Live Match, then Match Pulse | Pause at ~56'. Click the **50' Momentum swings to North City** chip, then click the momentum-shift marker on the chart. | "Match Pulse is a documented momentum index, not a scoring probability. At 50 minutes it flips. Click the marker: here is what happened, why the system flagged it, the exact events that contributed, and the statistics for the window." Press **Explain** to show the AI explanation, which carries a Narrative VAR status. |
| 0:45 to 1:10 | Narrative VAR | Click the predefined claim **"North City FC has dominated the last ten minutes with 85% possession"** (replay clock at ~67'). | "Narrative VAR checks commentary against evidence. The claim says 85 percent. The event data says 57 in that window. Status: CORRECTED, with the before and after, the revised sentence, two possession readings, and the twelve events used." Then click **Fabricated goal**: "A goal that never happened is UNSUPPORTED. Opinions are UNVERIFIED, not false." |
| 1:10 to 1:40 | AI Studio | Press **Full-time** in replay controls (or just open the tab), press **Start debate**. | "At full time three original pundits debate Player of the Match: the Analyst argues from volume, the Fan from decisive moments, the Tactician from structure. Two bounded rounds, every argument fact-checked. The moderator gives an evidence-based verdict: the panel is split two to one, and the disagreement is shown, not hidden." |
| 1:40 to 1:55 | Match Recap | Toggle **Fan mode** to **Analyst mode**, point at the verified sections and the mode badge. | "The recap serves fans and analysts from the same verified facts. In Foundry mode the explanations, debate and recap come from Microsoft Foundry models through Agent Framework agents; in demo mode they are deterministic, and the badge always tells you which. Understand what is happening, why it matters, and whether you can trust the explanation. PULSE AI, beyond the scoreline." |

Reliability notes

- Use the **Jump to** chips instead of waiting: every goal and shift has one.
- The VAR example works at any replay time; the demo number (57%) corresponds to the clock at 67:00 (`jump to 71' goal`, then drag back slightly, or untick "check against the replay clock" to use full time, which gives 64%).
- The debate is cached per match; **Run again** forces a fresh run (useful in Foundry mode).
- If the backend is down the UI shows a clear error with the start command and a Retry button.
