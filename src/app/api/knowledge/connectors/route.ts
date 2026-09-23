import { NextResponse } from "next/server";
import { KNOWLEDGE_CONNECTORS } from "@/lib/knowledge/connectors";
export const runtime="nodejs";
export async function GET(){ return NextResponse.json({connectors:KNOWLEDGE_CONNECTORS}); }
