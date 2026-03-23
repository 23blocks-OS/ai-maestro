# Build Check v5 - 2026-03-22

## Result: FAILED

## Error

```
./app/api/plugin-builder/scan-repo/route.ts:97:8
Type error: Cannot find name 'ALLOWED_REPO_HOSTS'.

   95 |   // hostname strips the port, host includes it — exact match only; subdomain wildcards
   96 |   // would allow SSRF via arbitrary-depth subdomains on the allowed domains
>  97 |   if (!ALLOWED_REPO_HOSTS.some(allowed => parsedUrl.hostname === allowed)) {
      |        ^
   98 |     return NextResponse.json(
   99 |       { error: 'Repository URL must be from github.com or gitlab.com' },
  100 |       { status: 400 }
```

## Summary

The build fails due to a TypeScript error in `app/api/plugin-builder/scan-repo/route.ts` at line 97.
The constant `ALLOWED_REPO_HOSTS` is referenced but never defined in scope. It needs to be declared
(e.g., `const ALLOWED_REPO_HOSTS = ['github.com', 'gitlab.com']`) before it is used.

## Warnings (non-blocking)

- 3 critical dependency warnings (cerebellum voice-subsystem, claude-provider, @huggingface/transformers)
- ~50 React Hook dependency warnings across many components
- ~20 `<img>` vs `next/image` warnings
- 1 aria-expanded role warning in MessageCenter.tsx
- 1 baseline-browser-mapping outdated data warning
