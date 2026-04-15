---
name: ernie-image
description: ERNIE-Image parameter planning and prompt design for Baidu AI Studio image generation. Use when the user wants to create images with ERNIE-Image, improve ERNIE prompts, or choose ERNIE-specific arguments such as size, seed, use_pe, num_inference_steps, guidance_scale, n, and response_format.
---

# ERNIE-Image

Use this skill when the user is generating images with Baidu AI Studio ERNIE-Image and needs concrete help choosing arguments, not just prompt polishing.

## What this skill should do

- Translate a vague image request into a production-ready prompt.
- Recommend ERNIE-Image arguments that match the goal.
- Explain the tradeoff for each non-default argument in plain language.
- Output a final parameter block or runnable `client.images.generate(...)` call when useful.

## Parameter defaults to reason from

```python
client.images.generate(
    model="ernie-image-turbo",
    prompt="...",
    n=1,
    response_format="b64_json",
    size="1024x1024",
    extra_body={
        "seed": 42,
        "use_pe": True,
        "num_inference_steps": 8,
        "guidance_scale": 1.0,
    },
)
```

## Decision rules

### `size`

- Use `1024x1024` for square covers, posters, avatars, icons, and most general requests.
- Use `1376x768` or `768x1376` for dramatic landscape or portrait compositions.
- Use `1264x848` / `848x1264` when the user wants a more photographic frame with less panoramic distortion.
- Use `1200x896` / `896x1200` for editorial and product marketing layouts with moderate aspect ratio changes.

### `seed`

- Keep or set a fixed seed when the user wants repeatability, iterative refinement, or later prompt comparisons.
- Omit or change the seed when the user wants broader exploration.
- If the user asks for multiple variants, recommend keeping the prompt stable and changing only the seed.

### `use_pe`

- Recommend `True` when prompt fidelity matters and the user has a clear composition, subject, text placement, or style target.
- Consider `False` only when the user wants looser interpretation or broader creative drift.

### `num_inference_steps`

- Start around `8` for fast drafts.
- Raise modestly when the user wants cleaner details and can accept slower generation.
- Keep it low for idea exploration or multi-variant runs.

### `guidance_scale`

- Start around `1.0`.
- Raise it when the user wants stricter adherence to prompt details.
- Lower it when the output feels too rigid or overconstrained.
- Change it in small increments and explain why.

### `n`

- Use `1` for deliberate single-shot work or when cost and stability matter.
- Use `2-4` for exploration, but keep the rest of the parameters stable so the user can compare outputs.

### `response_format`

- Prefer `b64_json` for scripts, automation, downloads, and local post-processing.
- Prefer `url` only when the user explicitly wants a hosted URL or a quick manual preview flow.

## Prompt construction

- Write the prompt in the user's language unless another language is clearly better for the subject matter.
- Put the main subject, setting, composition, style, lighting, and quality constraints in that order.
- Include camera or layout language only if it materially helps the requested image.
- Avoid stuffing every style term available. Prefer one coherent visual direction.

## Response format

When the user asks for help, usually return:

1. A refined prompt.
2. Recommended arguments with one-line justification each.
3. A final JSON object or Python snippet.

If the user already has a prompt, focus on parameter selection and only rewrite the prompt when it is clearly weak.
