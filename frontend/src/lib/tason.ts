import 'server-only';

import type { ValidRecipient } from '@/lib/recipient-validation';

// 타스온 문자 발송 어댑터.
//
// 공개 규격 v1.3 (https://www.tason.com/developer/api) 기준. 규격에 예약 발송 파라미터가
// 없어서 예약은 우리가 그 시각에 호출하는 방식으로 간다 (docs/02 참고).
//
// API Key 는 아직 발급 신청 단계라, 키가 없으면 자동으로 드라이런으로 떨어진다.
// 드라이런은 외부 호출을 하지 않고 성공 응답을 흉내낸다 — 발송을 뺀 나머지 경로
// (대상자 산출·배치 분할·이력 기록·중복 스킵)를 실물 문자 없이 끝까지 확인하기 위한 것이다.

const ENDPOINT = 'https://api.tason.com/tas-api/send';

export type SendOutcome = {
  ok: boolean;
  /** 타스온이 돌려준 메시지 식별자. notifications.external_message_id 에 남긴다. */
  messageId: string | null;
  error: string | null;
  /** 실제 전송 없이 흉내낸 결과인지. 이력에 그대로 기록해 나중에 구분할 수 있게 한다. */
  dryRun: boolean;
};

export type TasonConfig = {
  tasId: string;
  authKey: string;
  sender: string;
  senderName: string | null;
};

/**
 * 환경변수에서 설정을 읽는다.
 *
 * 셋 중 하나라도 없으면 null — 호출부는 이때 드라이런으로 간다. TASON_DRY_RUN=true 면
 * 키가 다 있어도 드라이런이다. 실물 발송으로 넘어가는 스위치를 명시적으로 두기 위함이다.
 */
export function loadTasonConfig(): TasonConfig | null {
  const tasId = process.env.TASON_ID;
  const authKey = process.env.TASON_AUTH_KEY;
  const sender = process.env.TASON_SENDER;
  if (!tasId || !authKey || !sender) return null;
  return { tasId, authKey, sender, senderName: process.env.TASON_SENDER_NAME ?? null };
}

export function isDryRun(): boolean {
  if (process.env.TASON_DRY_RUN === 'true') return true;
  return loadTasonConfig() === null;
}

/**
 * 한 배치를 보낸다. 배치 크기는 호출부(recipient-validation)가 이미 맞춰 둔 것을 전제한다.
 *
 * 성공/실패는 배치 단위로만 판정한다. 규격상 수신자별 결과가 응답에 오지 않으므로,
 * 배치가 실패하면 그 배치 전원을 미발송으로 남기고 다음 호출에서 다시 시도한다.
 */
export async function sendSmsBatch(
  recipients: readonly ValidRecipient[],
  message: string
): Promise<SendOutcome> {
  if (recipients.length === 0) {
    return { ok: true, messageId: null, error: null, dryRun: isDryRun() };
  }

  const config = loadTasonConfig();
  if (config === null || process.env.TASON_DRY_RUN === 'true') {
    return { ok: true, messageId: null, error: null, dryRun: true };
  }

  // SM(단문)은 90바이트 제한. 넘으면 LM(장문)으로 보내야 잘리지 않는다.
  const sendType = new TextEncoder().encode(message).length > 90 ? 'LM' : 'SM';

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tas_id: config.tasId,
        auth_key: config.authKey,
        send_type: sendType,
        data: recipients.map((r) => ({
          user_name: r.name,
          user_email: r.phoneDigits, // 규격상 수신 휴대폰번호가 이 필드에 들어간다
          map_content: message,
          sender: config.sender,
          ...(config.senderName ? { sender_name: config.senderName } : {})
        }))
      })
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        messageId: null,
        error: `HTTP ${res.status} ${text.slice(0, 200)}`,
        dryRun: false
      };
    }

    let messageId: string | null = null;
    let error: string | null = null;
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const code = String(body.result_code ?? body.code ?? '');
      // 41 = 미인증 발신번호이거나 수신자가 비었을 때
      if (code && code !== '0' && code !== '200') {
        error = `타스온 오류 코드 ${code}: ${String(body.result_message ?? body.message ?? '')}`;
      }
      const id = body.message_id ?? body.msg_id;
      if (typeof id === 'string' || typeof id === 'number') messageId = String(id);
    } catch {
      // 응답이 JSON 이 아니면 본문을 그대로 근거로 남긴다.
      error = `응답 파싱 실패: ${text.slice(0, 200)}`;
    }

    return { ok: error === null, messageId, error, dryRun: false };
  } catch (e) {
    return {
      ok: false,
      messageId: null,
      error: e instanceof Error ? e.message : String(e),
      dryRun: false
    };
  }
}
