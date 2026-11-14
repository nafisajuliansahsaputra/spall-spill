// Static application zones must never be mistaken for an anonymous creator page.
const reserved = new Set(["signup", "login", "recovery", "onboarding", "dashboard", "ops", "auth", "api", "media"]);
export function isPublicIdentityPath(path: string) {
  return /^\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]$/.test(path)
    && !reserved.has(path.slice(1).toLowerCase());
}
export function isPublicIdentityOpenPath(path: string) {
  return /^\/api\/public\/identity\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]\/open$/.test(path);
}

export function isPublicSpillPath(path:string){const p=path.split("/");return (p.length===3||p.length===4)&&p[2]==="spill"&&isPublicIdentityPath(`/${p[1]}`)&&(p.length===3||/^[1-9][0-9]{0,15}$/.test(p[3]!)&&Number.isSafeInteger(Number(p[3])));}
