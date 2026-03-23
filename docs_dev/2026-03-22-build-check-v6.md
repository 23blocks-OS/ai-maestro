# Build Check v6 - 2026-03-22

## Result: FAILED

## Error

```
./app/api/plugin-builder/scan-repo/route.ts:120:44
Type error: Argument of type 'string | null' is not assignable to parameter of type 'string | undefined'.
  Type 'null' is not assignable to type 'string | undefined'.

  118 |
  119 |   try {
> 120 |     const result = await scanRepo(repoUrl, ref)
      |                                            ^
  121 |
  122 |     if (result.error) {
  123 |       return NextResponse.json(
```

The `ref` variable is typed as `string | null` (from `searchParams.get('ref')`) but `scanRepo()` expects `string | undefined` as its second parameter. `null` is not assignable to `undefined` under strict TypeScript.

## Warnings (non-blocking)

- 3 critical dependency warnings (cerebellum voice-subsystem, claude-provider, @huggingface/transformers)
- ~50 React Hook dependency warnings (useEffect/useCallback/useMemo missing deps)
- ~20 `<img>` vs `<Image />` warnings
- 1 aria-expanded role warning (MessageCenter.tsx)
- 1 baseline-browser-mapping staleness warning

## Full Output

Full build output saved to `/tmp/build-output-v6.txt`
