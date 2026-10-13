# NAI Comic Studio v0.2.5 — Style separation + editable NovelAI preview + per-image regeneration

Update all five root files of your existing GitHub repo and commit. In SillyTavern update extension and hard reload (Ctrl+F5). Saved character libraries, style and negative presets, Qwen instructions and settings use the original `nai_comic_studio` settings key and are not reset.

## Changes
- Restores old `sillyimages` style injection layout. Style tags are passed through UNMODIFIED and inserted as a separate leading block, followed by exactly two newlines, then the scene/comic tags. One official V5 base caption receives both; NovelAI's API does not provide a separate `style` parameter. Both `input` and `v4_prompt.caption.base_caption` receive IDENTICAL combined text.
- Preview now exposes style, scene, chat character, persona, global negative and two individual negatives as EDITABLE fields. Changing them updates exactly the outgoing request; it doesn't overwrite saved libraries. The collapsible exact assembled prompt and JSON debug show what NovelAI receives. Press Generate to use those edits. "Собрать заново из настроек" discards these temporary edits.
- Under attached images (including previous images with `nai-comic-generated` class) is a button to re-generate the SAME message image from the current request. No new roleplay text. A second regenerate button appears below the latest generated image in the extension panel.
- Every fresh generation rebuilds the request if inputs/styles/character descriptions changed. It preserves editable preview changes as long as no underlying settings changed. Does not call Qwen again unless user presses "1. Qwen: сцена".
- Existing character and NPC text descriptions still go into separate `char_captions`, negatives into `v4_negative_prompt`. Style presets and negative presets are not altered.

## IMPORTANT
Before spending Anlas: press **2. Предпросмотр**, edit any visible text fields, inspect "Точная сборка", then **3. Создать**. For already attached images, change scene/characters/styles then click the button below that image. No RP regeneration.

Beta: locally validated for syntax, request structure and prompt composition; not tested on user's hosted SillyTavern/NovelAI account. Image layout still depends on the model.
