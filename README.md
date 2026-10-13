# NAI Comic Studio v0.2.3 — Shino scene directing and official NovelAI V5 tags

A minimal update over v0.2.2. Settings remain under the same SillyTavern extension key `nai_comic_studio`.

## What changed
- Restores the original detailed Shino `naicom (18)` visual directing language, adapted to the current JSON scene/character/persona fields. Qwen only extracts scene, clothing, actions and emotions; the existing character library remains separate.
- Automatically migrates prior built-in default Qwen scene prompt to the restored Shino edition. Any personalized main Qwen prompt not matching the old default is kept unchanged. You can always reset the main prompt using the existing UI.
- Official NovelAI V5 model still receives `input` and `v4_prompt.caption.base_caption` for the base, with separate unnumbered character `char_captions` and `v4_negative_prompt` for undesired content. Literal `|` in the debug preview is presentation ONLY, not transmitted as the underlying split format.
- Count tags (`1boy`, `1girl`) and actual recognized composition tags (`comic`, `comic page`, `3 panels`, `multiple panels`) precede the scene. Style is added once, **after** the main scene composition, but still in the base caption. This follows NovelAI guidance that early prompt instructions matter most.
- Repairs only an unpaired numeric tag weight when generating: `0.9::backlighting,` becomes `0.9::backlighting::,`. The saved style text is not modified.
- Maintains character descriptions / negatives from the existing libraries, chat-specific settings, debug preview and connection profiles.

## Installation
Replace `index.js`, `core.mjs`, `style.css`, `manifest.json`, and `README.md` in the root of the **same GitHub repo** (no new repository), commit, run SillyTavern Extension Update and Ctrl+F5. Confirm the panel heading shows `NAI Comic Studio · v0.2.3`.

## Free test before Anlas
1. Select your chat and Qwen profile; open **Сцена от Qwen**. Use **Свой главный промпт Qwen -> Вернуть базовую инструкцию** if you had customized it and want the exact Shino adapted version.
2. Press **1. Qwen: сцена** to regenerate the scene fields.
3. Press **2. Предпросмотр · бесплатно**. Check the base has `1boy, 1girl, comic, comic page, ...` and actual main-frame scene and style. Check Yukio/Ness have separate appearance captions with clothing/actions. Check negative fields and provider JSON. Do not pay unless correct.

This update makes tag packing correct and easier to inspect; neither prompting nor NovelAI API guarantees perfect anatomy, full character consistency or successful multi-panel interpretation.
