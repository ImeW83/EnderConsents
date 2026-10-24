export interface Actor {
  actorType: string;
  actorId: string | null;
  // Request origin, recorded on consent events as evidence of where the action came from
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const SYSTEM_ACTOR: Actor = { actorType: 'system', actorId: null };

const requestOrigin = (req: any) => ({
  ipAddress: (req.ip as string | undefined) ?? null,
  userAgent: (req.headers?.['user-agent'] as string | undefined) ?? null,
});

// Every JWT-authenticated call is an org user acting directly or on a subject's behalf
export const actorFrom = (req: any): Actor => ({
  actorType: 'admin',
  actorId: req.user.userId as string,
  ...requestOrigin(req),
});

// An organization's server relaying an action the subject took themselves,
// authenticated by API key; the key's id is recorded in the audit trail via the actor id
export const subjectActorFrom = (req: any, subjectId: string): Actor => ({
  actorType: 'subject',
  actorId: subjectId,
  ...requestOrigin(req),
});
