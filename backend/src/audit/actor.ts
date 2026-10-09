export interface Actor {
  actorType: string;
  actorId: string | null;
}

export const SYSTEM_ACTOR: Actor = { actorType: 'system', actorId: null };

// Every authenticated call is currently an org user acting directly or on a subject's behalf
export const actorFrom = (req: any): Actor => ({
  actorType: 'admin',
  actorId: req.user.userId as string,
});
