import { id } from "@/lib/ids";

type Session={userId:string;clientId:string;expiresAt:number};
const sessions=new Map<string,Session>();
const TTL=24*60*60_000;

export function createSession(userId:string,clientId:string):string {const sessionId=id("mcpsession");sessions.set(sessionId,{userId,clientId,expiresAt:Date.now()+TTL});return sessionId;}
export function validateSession(sessionId:string,userId:string,clientId:string):boolean {const session=sessions.get(sessionId);if(!session||session.expiresAt<=Date.now()||session.userId!==userId||session.clientId!==clientId){sessions.delete(sessionId);return false;}session.expiresAt=Date.now()+TTL;return true;}
export function deleteSession(sessionId:string):void {sessions.delete(sessionId);}
