#!/usr/bin/env python3
"""Check mode handoff, Abyss fallback, and the source retry decision."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "docs/rules"
OUT = RULES / "modes-readiness-closure.json"


def original_probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    unit, function, execute, world = (vm[key] for key in ("unit", "function", "execute", "World"))
    no_op = lambda *_: None
    fallback = function("main/f290/f25")
    finish = function("main/f290/f11")
    vectors = []

    for select in (True, False):
        w = world()
        e = w.env
        worker = unit("b116", 0, J003=1)
        other_owner, regular, dead_hero, later = unit("H040", 11), unit("n255"), unit("H001"), unit("H002")
        regular["nativeHero"] = False
        dead_hero["life"] = 0
        candidates = [regular, other_owner] + ([dead_hero, later] if select else [])
        e.update(
            Player_Build_Unit={1: worker}, Limit_Hero={1: "H010"}, DeLuYi_XiongLingHuoBan={},
            J003_Temp={}, Abyss_Cur_Lv=2, GetPlayerId=lambda p: p, IsUnitOwnedByPlayer=lambda u, p: bool(u and u["owner"] == p),
            CreateGroup=list, GroupEnumUnitsInRange=lambda g, *_: g.extend(candidates),
            FirstOfGroup=lambda g: g[0] if g else None,
            GroupRemoveUnit=lambda g, u: g.remove(u) if u is not None else None,
            GroupClear=list.clear, DestroyGroup=no_op,
            _loop_=lambda: (lambda *_: True, None, None), DestroyTimerDialog=no_op,
            Abyss_ShowFightText=no_op, CreateTimerDialog=lambda t: t,
            TimerDialogSetTitle=no_op, TimerDialogDisplay=no_op,
        )
        execute(fallback, [e, None, no_op, None, None, 30, no_op, {}, {}, no_op],
                stop_pc=fallback["labels"]["l178"] - 1)
        result = e["J003_Hero"].get(1)
        assert result is (dead_hero if select else None)
        assert "J003" not in worker["skills"] and any(row[0] == 5 for row in w.queue)
        vectors.append({"probe": "native-fallback-" + ("no-lua-alive-filter" if select else "empty"),
                        "selected": result and result["kind"], "spawnAfter": 5})

    for stage, life, retries, outcome in ((1, 300, 0, "next"), (2, 0, 0, "next"),
                                           (2, 375, 4, "retry"), (4, 9200, 1, "retry"), (4, 500, 0, "defeat")):
        w = world()
        e = w.env
        boss = unit("boss", 11)
        boss["life"] = life
        calls = []
        e.update(
            StopMusic=no_op, DestroyTimerDialog=no_op, Abyss_All_unit_Loc={}, Abyss_All_item_Loc={},
            J003_Temp={}, Abyss_Cur_Lv=stage, Abyss_BOSS=boss, Abyss_Desc={n:{} for n in range(1,5)},
            RemoveUnit=lambda _: calls.append("remove"), DisplayTextToAll=no_op,
            ClearAllMon=lambda: calls.append("clear"), DefeatOfEveryOne=lambda: calls.append("defeat"),
            Abyss_Start_New_Turn=no_op, delayTimeRunFunc=lambda _, delay: calls.append(delay),
        )
        ups = [e, None, None, None, {}, {}, None, {}, retries, 800, lambda: calls.append("success")]
        execute(finish, ups)
        if outcome == "retry":
            assert ups[8:10] == [retries-1, life] and e["Abyss_Cur_Lv"] == stage-1 and calls == ["clear",8]
        elif outcome == "next":
            assert ups[8:10] == [retries,0] and calls == (["remove"] if stage==1 else [])+["clear","success",8]
        else:
            assert calls == ["defeat"] and ups[8] == retries
        vectors.append({"probe": "native-round-end", "stage":stage,"life":life,"retriesBefore":retries,
                        "outcome":outcome,"calls":calls})
    return world, vectors


def tie_probes(world):
    vectors = []
    for kind in ("capacity", "roshan", "abyss", "dragon", "prep"):
        for event_first in (False, True):
            w = world()
            state = {"done": False, "unitPresent": True, "points": 101, "kills": 0, "hero": None}
            outputs = []

            def settle():
                if state["done"]:
                    return
                state["done"] = True
                outcomes = {
                    "capacity": "spawn" if state["points"] <= 100 else "defeat",
                    "roshan": "post-mode+8000" if state["kills"] else "mainline-settlement",
                    "abyss": "reward-next" if state["kills"] else "retry-remaining-HP",
                    "dragon": "save-rank+revive-30s" if state["kills"] else "retry-same-rank",
                    "prep": state["hero"] or "automatic",
                }
                outputs.append(outcomes[kind])
                if kind != "capacity":
                    state["unitPresent"] = False

            def effect():
                if not state["unitPresent"] or state["done"]:
                    return
                if kind == "prep":
                    state["hero"] = "manual"
                    settle()
                else:
                    state["points"] -= 1
                    state["kills"] += 1
                    if kind != "capacity":
                        settle()

            for callback in ((effect, settle) if event_first else (settle, effect)):
                w.start(w.timer(), 10, False, callback)
            w.advance(10)
            expectations = {
                "capacity": ("defeat","spawn"), "roshan": ("mainline-settlement","post-mode+8000"),
                "abyss": ("retry-remaining-HP","reward-next"), "dragon": ("retry-same-rank","save-rank+revive-30s"),
                "prep": ("automatic","manual"),
            }
            assert outputs == [expectations[kind][event_first]]
            vectors.append({"probe":"B05-mode-boundary","kind":kind,"effectFirst":event_first,"outcome":outputs[0]})
    return vectors


def report():
    boundaries = json.loads((RULES/"web-wave-boundaries.json").read_text())
    dragons = json.loads((RULES/"npc-abyss-dragon-abilities.json").read_text())
    assert len(boundaries["mainline"]) == 54
    assert boundaries["verification"]["mainlineUnitsSumPerContinuouslyActivePortal"] == 2300
    assert boundaries["endlessOrdinary"]["spawnOffsetsMicroseconds"] == list(range(0,14000000,2000000))
    assert boundaries["endlessOrdinary"]["newlySpawnedCapacityPointsPerActivePortal"] == 14
    world, vectors = original_probes()
    return {
        "id":"modes-readiness-v1","status":"ready","scope":"single-player ordinary reachable game",
        "source":"reference/map-6.25/main.disasm","sourceHash":dragons["sourceHash"],
        "shared":[ "web-wave-boundaries.json","challenge-spawns.json","tower-lifecycle.md","npc-abyss-dragon-abilities.json",
                   "damage-pipeline.md","skill-lizard-frenzy-and-gold.md","waves-data.json"],
        "waveCounts":{"authority":"web-wave-boundaries.json","endlessOrdinary":7,"finalMainlineSpawnAtWindowEnd":False},
        "capacity":{"checkOn":"wave start or Roshan start before advancing counter/spawning","failure":"current points > limit",
                    "boardRefreshSeconds":2,"boardCanEndRun":False,"deathBeforeCheckRemovesPoints":True,
                    "ordinaryEndlessFailureOutcome":"score settlement"},
        "mainlineGold":{"commit":"sum B03 gold-target score from actual damage source owner",
                        "close":"kill remaining m999/m998, calculate and reset sum, then credit integer gold",
                        "rounding":"floor initial linear term, successive soft caps, floor after Q18 VIP factor, integer SetPlayerState",
                        "sourceLines":[[166725,166785],[182754,183124]]},
        "roshan":{"deadline":480,"death":"actual current mBOS death increments count",
                  "settlement":"once; actual positive kills and selected post-mode => 8000 per kill and +5 transition; otherwise mainline victory settlement",
                  "sourceLines":[[183699,183741],[185067,185075],[168664,168696],[185973,186112]]},
        "abyss":{"initialRank":0,"entryToFirstPrep":30,"prepSeconds":240,"prepToSpawnSeconds":5,
                 "manual":"accepted J003 unit-target, same owner, one round selection; all chosen immediately close preparation",
                 "fallback":{"workerGate":"J003 still present","center":[0,0],"radius":100000,
                             "conditions":["native HERO","same owner as worker","H010 uniqueness when applicable"],
                             "order":"B04 existing non-removed spatial entities in creation order; shared group excludes hidden and Aloc",
                             "extraScriptAliveGate":False,"empty":"consume J003, keep empty; continue after 5 seconds"},
                 "selectedUnit":"keep stable entity id through tower resurrection; no automatic retarget until next prep",
                 "stages":{"1":{"template":"ma01","duration":60,"end":"success even with boss alive; remove uncollected chicken drops"},
                           "2":{"template":"ma03","duration":150,"normalDeathDrop":"i800","successfulWorkerReward":"i237"},
                           "3":{"template":"ma06","duration":150,"successfulWorkerReward":"i237"},
                           "4":{"template":"ma99","duration":150,"death":"save previous rank, increment rank, begin protected revival"}},
                 "retry":{"sharedRemainingInitially":4,"failure":"non-trial current boss HP>0 on timeout",
                          "carry":"absolute HP and same rank; reset selection/hidden state; new preparation after 8 seconds",
                          "newFightDuration":"fresh stage template initial duration, including 150 on dragon retry",
                          "stopAfterFailedAttempts":5,"afterSuccessAdvanceSeconds":8},
                 "dragonRevival":{"offsetsSeconds":[2,7.5,9.5],"inherits":["position","facing","path userData"],
                                  "countdownAtCombatResume":"min(300, old remaining + 30)",
                                  "saveBeforeIncrement":True,"keepsParticipants":True,"ordinaryWorkerReward":False},
                 "sourceLines":[[59938,60104],[157085,157262],[157392,157403],[158206,158269],[158440,158755],
                                [158896,159246],[159594,160035],[160092,160255]]},
        "queue":{"order":["deadlineMicros","enqueueSequence"],
                 "settlement":"consume mode-phase generation once; death runs synchronously within committing damage",
                 "invalidate":"cancel prior-phase mode timers, ignore stale settlement attempts and hits to removed enemy entities",
                 "save":["simulation clock and enqueue sequence","phase and attempt/rank generation","active deadline and current boss ID",
                         "selected heroes and companions","hidden entity/item restoration records","retry budget and saved absolute boss HP",
                         "dragon revival subphase and retained time","settlement/reward committed state"]},
        "verification":vectors+tie_probes(world), "pending":[],
    }


if __name__ == "__main__":
    data = report()
    payload = json.dumps(data, ensure_ascii=False, indent=2)+"\n"
    if sys.argv[1:] == ["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text() == payload
    print(f'{len(data["verification"])} mode probes; shared wave counts confirmed')
