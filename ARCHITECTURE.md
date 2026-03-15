# Infinite Knob — Architecture

A semantic audio instrument. Type a word, move the knob, hear the word become sound.

---

## System Overview

```mermaid
graph TD
    User["👤 User"]
    Input["AIInputWithLoading\ntext input"]
    Slider["Slider\nknob 0–100"]
    App["App.tsx\norchestrator"]
    AI["SemanticInterpreter\ngpt-5-nano"]
    Engine["StrudelEngine\nWeb Audio"]
    Drums["DrumEngine\nsynth percussion"]
    Logger["UsageLogger"]
    Server["Express server\n:3001"]
    DB["SQLite\ndata/ik.db"]

    User -->|types word| Input
    User -->|moves knob| Slider
    Input -->|onSubmit| App
    Slider -->|onValueChange| App
    App -->|interpret| AI
    AI -->|SemanticMapping| App
    App -->|loadMapping| Engine
    App -->|setKnob 0–1| Engine
    Engine -->|drums / bpm params| Drums
    Engine -->|commit entry| Logger
    Logger -->|POST /api/log| Server
    Logger -->|fallback| LocalStorage["localStorage"]
    Server -->|insertEntry| DB
    Drums -->|AudioContext.destination| Audio["🔊 Audio output"]
    Engine -->|AudioContext.destination| Audio
```

---

## AI Interpretation Pipeline

```mermaid
flowchart LR
    Word["user input\ne.g. 'wailing'"]

    subgraph SemanticInterpreter
        Norm["normalise +\nspelling correct"]
        Dims["hidden dimensions\nbrightness · distance\ninstability · blur\nroughness · motion\nweight · strain"]
        Traj["trajectory design\n2–3 staged segments\nwith curve types"]
        GPT["gpt-5-nano\nJSON output"]
        FB["fallback\n5 deterministic presets"]
    end

    Result["SemanticMapping\n{ term, confidence,\n  latent, trajectory[] }"]

    Word --> Norm --> Dims --> Traj --> GPT --> Result
    GPT -->|"parse fails /\nempty trajectory"| FB --> Result
```

### Trajectory segment shape

```mermaid
graph LR
    Seg["TrajectorySegment\n{ range: [0.3, 0.75]\n  param: 'room'\n  from: 0.1\n  to: 0.7\n  curve: 'easeOut' }"]
    Curves["CurveType\nlinear · easeIn\neaseOut · easeInOut · exp"]
    Params["CapabilityParam × 18\ngain · wave · lpf · lpq · hpf\nshape · crush · fm · lfo\ndetune · sub · noise\nroom · delay · pan\ndrums · bpm"]
    Seg --- Curves
    Seg --- Params
```

---

## Audio Engine

```mermaid
graph TD
    subgraph Sources
        OscA["oscA\nsawtooth default"]
        OscB["oscB\ndetuned unison"]
        Noise["noiseSource\nlooping white noise"]
        Sub["subOsc\nsine, octave below"]
        FM["fmOsc → fmGain\n→ oscA.frequency"]
        LFO["lfoOsc → lfoGain\n→ tremoloGain.gain"]
        Const["constant(1)\n→ tremoloGain.gain"]
    end

    subgraph Processing
        WS["waveshaper\ndistortion"]
        Crush["crushShaper\nbit reduction"]
        LPF["lpFilter\nlowpass 80–18k Hz"]
        HPF["hpFilter\nhighpass 20–8k Hz"]
        Trem["tremoloGain\namplitude mod"]
    end

    subgraph Output
        Dry["dryGain"]
        Rev["reverb convolver\n→ reverbGain"]
        Del["delayNode + feedback\n→ delayGain"]
        Pan["panner\nstereo -1..1"]
        Master["masterGain"]
        Dest["ctx.destination"]
    end

    OscA --> WS
    OscB --> WS
    Noise --> WS
    WS --> Crush --> LPF --> HPF --> Trem
    Trem --> Dry --> Master
    Trem --> Rev --> Master
    Trem --> Del --> Master
    Sub --> Master
    Master --> Pan --> Dest
```

### Parameter → node mapping

```mermaid
graph LR
    subgraph Synth
        gain --> masterGain.gain
        wave --> oscA.type & oscB.type
        detune --> oscB.detune & oscBGain.gain
        sub --> subGain.gain
        noise --> noiseGain.gain
        fm --> fmGain.gain
    end
    subgraph Filter
        lpf --> lpFilter.frequency
        lpq --> lpFilter.Q
        hpf --> hpFilter.frequency
    end
    subgraph Texture
        shape --> waveshaper.curve
        crush --> crushShaper.curve
    end
    subgraph Modulation
        lfo --> lfoOsc.frequency & lfoGain.gain
    end
    subgraph Space
        room --> reverbGain.gain & dryGain.gain
        delay --> delayGain.gain
        pan --> panner.pan
    end
    subgraph Rhythm
        drums --> DrumEngine.setLevel
        bpm --> DrumEngine.setBpm
    end
```

---

## Drum Engine

```mermaid
graph TD
    Scheduler["setInterval 25ms\nlookahead 100ms"]
    BPM["BPM → pattern select\n<85 sparse\n85–110 groove\n110–135 basic\n135–160 techno\n>160 jungle"]
    Step["scheduleStep\nhit probability = min(1, level × 1.5)"]

    Kick["kick\nsine 150→40 Hz\npitch + amp envelope"]
    Snare["snare\ntriangle 185 Hz\n+ highpassed noise"]
    Hihat["hihat\nhighpassed noise\n7k Hz, 60ms"]

    DrumMaster["DrumEngine master gain\n→ ctx.destination"]

    Scheduler --> BPM --> Step
    Step --> Kick & Snare & Hihat
    Kick & Snare & Hihat --> DrumMaster
```

---

## Continuity + Additive Layering

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Engine

    Note over Engine: lockedParams = { gain: 0 }

    User->>App: move slider to 0.76
    App->>Engine: setKnob(0.76)
    Engine->>Engine: evalTrajectory(current, 0.76) → params
    Engine->>Engine: applyParams() via setTargetAtTime

    User->>App: type "wailing"
    App->>Engine: loadMapping(wailing)
    Engine->>Engine: commit → lock effective params at knob=0.76
    Engine->>Engine: log entry to UsageLogger
    Engine->>Engine: adjust new trajectory:\nfirst segment.from = lockedParams[param]
    Engine->>Engine: reset knob to 0
    Note over Engine: sound unchanged at knob=0\nonly moves as user turns knob
```

---

## Logging + Persistence

```mermaid
graph TD
    Commit["UsageLogger.commit(entry)"]
    API["POST /api/log\nExpress :3001"]
    SQLite["SQLite\ndata/ik.db\ntable: usage_log"]
    LS["localStorage\nik_usage_log"]
    Win["window.__ik_log\nconsole inspection"]
    DL["window.__ik_download_log()\nJSON export"]

    Commit -->|primary| API --> SQLite
    Commit -->|fallback if server down| LS
    Commit --> Win
    LS --> DL

    subgraph LogEntry
        Fields["ts · term · confidence\nlatent · aiTrajectory[]\ncommittedPosition\neffectiveParams"]
    end
```

---

## File Map

```mermaid
graph LR
    subgraph src/ai
        types["types.ts\nCapabilityParam · CurveType\nTrajectorySegment · SemanticMapping"]
        interp["SemanticInterpreter.ts\ninterpret() · fallbackMapping()"]
    end

    subgraph src/audio
        engine["StrudelEngine.ts\nmain synth + trajectory eval"]
        drums["DrumEngine.ts\nsynth percussion + scheduler"]
        logger["UsageLogger.ts\ndual-path log writer"]
    end

    subgraph src/components
        slider["ui/slider.tsx\nRadix slider + tooltip"]
        aiinput["ui/ai-input-with-loading.tsx\nautoresize textarea + spinner"]
    end

    subgraph server
        srv["index.ts\nExpress :3001\nPOST+GET /api/log"]
        db["db.ts\nbetter-sqlite3\ninsertEntry · allEntries"]
    end

    App["src/App.tsx"] --> engine & interp & slider & aiinput
    engine --> drums & logger & types
    interp --> types
    logger -->|fetch| srv
    srv --> db
```

---

## What's planned next

```mermaid
graph TD
    Now["current state"]

    PatchLib["Patch Library\nauthored preset bank\n~20 named sounds"]
    LearnedPatches["Learned Patches\npromoted from log\nwhen term hits 3+ times\nwith committed_pos > 0.5"]
    KnowledgeGraph["Knowledge Graph\nterm↔patch affinity\nterm↔term similarity\npatch adjacency"]
    ContextAPI["GET /api/context?term=X\nreturns prior stats +\nnearest patches"]
    GroundedAI["Grounded AI\nprompt now includes:\n'users who typed X\nreached Y at pos Z'"]

    Now --> PatchLib
    PatchLib --> LearnedPatches
    LearnedPatches --> KnowledgeGraph
    KnowledgeGraph --> ContextAPI
    ContextAPI --> GroundedAI
```
