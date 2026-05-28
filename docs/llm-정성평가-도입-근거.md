# LLM 정성평가 도입 — 학술·규제 근거 정리

> 2026-05-28 작성. 공무원 교육 선발에서 활용계획(100자 내외 서술형) 답변의 LLM 기반 자동 채점 도입을 정당화하기 위한 출처·실무 권고 모음.

---

## 결론 한 줄

**"LLM 단독 자동 선발"은 학술·규제 근거 부족.** 반면 **"AI 보조 채점 + 운영자 최종 승인 + 검증·로그 절차 완비"** 형태로 설계하면 NIST·EU·한국 가이드라인 모두에 정합하며 인용 가능한 학술 근거도 충분.

100자 활용계획은 전통 essay scoring보다 short constructed response / rubric-based LLM judging에 가까워, **도입 전 내부 데이터 파일럿 검증이 필수**.

---

## 내부 결재·보고서용 Top 5 출처

| # | 출처 | 인용 위치 |
|---|---|---|
| 1 | NIST, 2023, *AI Risk Management Framework: AI RMF 1.0* | 결재 문서 위험관리 뼈대 (Govern·Map·Measure·Manage) |
| 2 | EU, 2024, *Regulation (EU) 2024/1689 (AI Act)* | 교육·채용 AI를 high-risk로 분류, 인간 감독 의무 |
| 3 | 디지털플랫폼정부위원회·NIA, 2024, *공공부문 초거대 AI 도입·활용 가이드라인* | 한국 공공기관 LLM 도입 직접 행정 근거 |
| 4 | Yancey et al., 2023, *Rating Short L2 Essays on the CEFR Scale with GPT-4* (BEA Workshop, ACL) | 짧은 서술형 답변 LLM 평가 가능성 학술 근거 |
| 5 | Zheng et al., 2023, *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena* (NeurIPS) | LLM judge 한계(length·position·style bias) 균형 인용 |

→ 이 Top 5만으로 **파일럿 도입과 보조 채점 정당화는 충분**. 단독 결정까지는 부족 — 내부 검증 데이터 별도 필요.

---

## 1. LLM-as-a-Judge / Automated Essay Scoring 학술 근거

- **Mizumoto & Eguchi, 2023**, "Exploring the potential of using an AI language model for automated essay scoring," *Research Methods in Applied Linguistics*, Elsevier
  https://www.sciencedirect.com/science/article/pii/S2772766123000101
  → ChatGPT/GPT 계열이 TOEFL류 에세이 점수와 상당한 일치 가능성. 교육 현장 적용은 검증 전제 필요.

- **Yancey, LaFlair, Verardi & Burstein, 2023**, "Rating Short L2 Essays on the CEFR Scale with GPT-4," *BEA Workshop, ACL*
  https://aclanthology.org/2023.bea-1.49.pdf
  → GPT-4가 짧은 L2 에세이 CEFR 평가 가능. 고부담 언어평가는 여전히 인간이 gold standard.

- **Naismith, Mulcaire & Burstein, 2023**, "Automated Evaluation of Written Discourse Coherence Using GPT-4," *BEA Workshop, ACL*
  https://aclanthology.org/2023.bea-1.32.pdf
  → GPT-4가 점수+근거 생성 가능. 재현성·편향·내부 판단 과정 불투명성 주의.

- **Bui & Barrot, 2024**, "Large language models and automated essay scoring of English language learner writing," *Computers and Education: Artificial Intelligence*, Elsevier
  https://www.sciencedirect.com/science/article/pii/S2666920X24000353
  → PaLM 2/Claude 2/GPT-3.5/GPT-4 비교, GPT-4 최고 신뢰도. 표본 작아 도메인별 검증 필요.

- **Zheng et al., 2023**, "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena," *NeurIPS Datasets and Benchmarks*
  https://arxiv.org/abs/2306.05685
  → LLM judge가 인간 선호와 꽤 일치하나 **position bias, verbosity/length bias, self-enhancement bias** 존재.

**우리 구현 권고**
- LLM 채점은 "사람 평가자 대체"가 아닌 **"1차 보조 채점 및 불일치 탐지 도구"**로 표현
- 도입 전 표본 검증: 사람 2인 독립채점 vs LLM 점수 → `Quadratic Weighted Kappa`, `Spearman/Pearson correlation`, ±1점 일치율, **컷오프 주변 오류율** 보고
- 100자 답변은 length bias 크게 작동 → rubric에 "장황함 자체를 가점하지 않음", "구체성은 실행 가능성 기준만"

---

## 2. High-stakes AI 검증 프레임워크

- **NIST, 2023**, "Artificial Intelligence Risk Management Framework: AI RMF 1.0"
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
  → `Govern · Map · Measure · Manage` 4단계 구조. 내부 결재 문서의 가장 좋은 뼈대.

- **OECD, 2019/2024**, "OECD AI Principles"
  https://www.oecd.org/en/topics/ai-principles.html
  → 인간중심·투명성·책임성·견고성·공정성을 국제 원칙으로.

- **EU, 2024**, "Regulation (EU) 2024/1689 (AI Act)," Official Journal of the EU
  https://eur-lex.europa.eu/eli/reg/2024/1689/oj
  → 교육·직업훈련 접근, 채용·근로자 관리 AI를 **high-risk** 분류. 공무원 교육 선발은 유사 고위험 맥락으로 보는 것이 보수적.

- **U.S. EEOC**, "Employment Tests and Selection Procedures"
  https://www.eeoc.gov/laws/guidance/employment-tests-and-selection-procedures
  → 선발 절차가 특정 집단을 불리하게 배제 시 직무 관련성·업무상 필요성 입증 의무.

- **개인정보보호위원회, 2024**, "자동화된 결정에 대한 정보주체의 권리 안내서"
  https://m.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=10611
  → 자동화된 결정에 대한 **설명·검토·거부권** 가능. 사람이 개입한 재처리 절차 중요.

**우리 구현 권고**
- 내부 보고서 구조: `위험 식별 → 검증 지표 → 완화 조치 → 인간 검토 → 문서 보관 → 이의제기`
- **완전 자동 결정 X, 운영자 최종 승인형**
- 자동화된 결정 설명 요구 대비: 점수 산출 주요 기준 / 루브릭 / 검토 절차 / 인간 재검토 방법 문서화

---

## 3. 공정성·편향 측정 방법론

- **Uniform Guidelines on Employee Selection Procedures, 1978** (U.S. EEOC/DOJ/DOL/CSC)
  https://www.law.cornell.edu/cfr/text/28/50.14
  → **4/5 rule**: 집단별 선발률이 최고 선발률 집단의 80% 미만이면 adverse impact 신호.

- **Dwork et al., 2012**, "Fairness Through Awareness," *ITCS*
  https://arxiv.org/abs/1104.3913
  → individual fairness("비슷한 사람은 비슷하게") + statistical parity 논의.

- **Hardt, Price & Srebro, 2016**, "Equality of Opportunity in Supervised Learning," *NeurIPS*
  https://papers.neurips.cc/paper/6374-equality-of-opportunity-in-supervised-learning
  → equal opportunity, equalized odds 등 대표적 fairness metric의 기준 논문.

- **Zheng et al., 2023** (위와 동일)
  → LLM judge의 position·verbosity·self-enhancement bias 실증.

- **Shermis & Burstein eds., 2013**, *Handbook of Automated Essay Evaluation*, Routledge
  → AES의 타당도·평가자 일치도·construct-irrelevant feature 표준 참고문헌.

**우리 구현 권고**
- **집단별 선발률 점검** (4/5 rule): 성별, 직급, 소속기관 유형, 지역, 직렬, 연령대
- **점수 분포 비교**: 집단별 평균/표준편차/컷오프 주변 탈락률/LLM-인간 점수차
- **편향 테스트**: 같은 답변에서 기관명·성별 암시 표현·문체만 바꾼 counterfactual set으로 점수 변동 측정
- **답변 길이 vs 점수 상관 측정** — 100자 제한에서 길이 편향이 곧 공정성 문제

---

## 4. 재현성·설명가능성 실무 패턴

- **Liu et al., 2023**, "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment," *EMNLP, ACL*
  https://aclanthology.org/2023.emnlp-main.153/
  → 명시적 평가 기준 + 단계적 평가 절차를 주면 LLM 평가가 인간 평가와 더 잘 일치.

- **Kim et al., 2024**, "Prometheus: Inducing Fine-grained Evaluation Capability in Language Models," *ICLR*
  https://arxiv.org/abs/2310.08491
  → reference answer + score rubric이 있을 때 세밀한 평가 성능 향상.

- **NIST AI RMF 1.0** (위와 동일) — 측정·모니터링·문서화·리스크 관리.

- **EU AI Act Article 14**, 2024, "Human Oversight"
  → 고위험 AI는 인간 감독 가능하도록 설계 의무.

**우리 구현 권고**
- **다차원 루브릭**: 1개 총점보다 5차원이 우월
  - 업무 관련성 / 구체성 / 실행 가능성 / 공공가치·확산 가능성 / AI 교육 적합성
  - 각 차원 1~5점 또는 1~3점 → 최종 10점 환산은 코드에 고정
- 프롬프트에 **good/mid/bad 예시** 포함 (기관·성별·직급 편향 없이 균형화)
- **로그 필수 항목**: `model`, `model version`, `temperature=0`, `seed`, `prompt hash`, `rubric version`, `입력 원문`, `출력 JSON`, `캐시 키`, `재채점 여부`
- **Human-in-the-loop 권장 기준** (학술 보편 정답 없음, 실무 권고):
  - 컷오프 ±1점 **전원 검토**
  - 무작위 **10~20% 이중검토**
  - **첫 회차는 가능하면 100% 운영자 검토**
- LLM 설명은 "모델 내부 원인" 아닌 **"루브릭 기준에 따른 사후 평가 근거"** 표현

---

## 5. 한국 공공부문 특수성

- **디지털플랫폼정부위원회·NIA, 2024**, "공공부문 초거대 AI 도입·활용 가이드라인"
  https://nia.or.kr/site/nia_kor/ex/bbs/View.do?bcIdx=26677&cbIdx=99852
  → 중앙부처·지자체·공공기관 초거대 AI 도입 절차·사례. **공공부문 도입 직접 근거**.

- **개인정보보호위원회, 2021**, "AI 개인정보보호 자율점검표 (개발자·운영자용)"
  https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=7348
  → AI 서비스 기획~운영·감독·피해구제까지 점검 항목.

- **관계부처 합동·과학기술정보통신부, 2020**, "사람이 중심이 되는 인공지능(AI) 윤리기준"
  → 인권보장·프라이버시·다양성·책임성·안전성·투명성 (국내 AI 윤리 기본 문서).

- **대한민국, 2026 시행**, "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법," 국가법령정보센터
  https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031809457
  → 고영향 AI에 대한 **위험관리·설명 방안·이용자 보호·사람의 관리/감독·문서 작성·보관** 요구.

- **개인정보보호위원회, 2024**, "자동화된 결정에 대한 개인정보처리자의 조치 기준 및 안내서"
  → 자동화된 결정의 **설명·검토 요구**, 사람이 개입한 재처리 절차 명확화.

**우리 구현 권고**
- 설계·공표 표현: ❌ "AI가 선발한다" → ⭕ **"AI가 루브릭 기반 예비점수와 검토 의견을 생성하고, 운영자가 최종 판단한다"**
- 정보공개·민원 대응용 5문서 비치:
  1. 평가 루브릭
  2. 프롬프트/모델 버전
  3. 검증 결과표
  4. 운영자 검토 기록
  5. 이의신청 재검토 절차
- 탈락자 설명 표현: ❌ "LLM이 낮게 평가" → ⭕ **"루브릭 ○○ 항목에서 ○○ 사유로 낮게 평가되었고, 사람이 ○○ 절차로 확인"**
- 개인정보 최소 수집: 답변 평가에 불필요한 **성명·주민번호·연락처·소속 세부정보 마스킹**

---

## 도입 체크리스트 (요약)

### Pre-launch
- [ ] Top 5 출처 인용한 내부 결재 문서 작성
- [ ] 5차원 rubric 설계
- [ ] good/mid/bad 예시 답변 준비 (편향 없이 균형화)
- [ ] 사람 2인 독립채점 vs LLM 표본 검증 (Kappa, Pearson, ±1점 일치율, 컷오프 오류율)
- [ ] counterfactual set으로 편향 테스트
- [ ] length-score correlation 측정

### Implementation
- [ ] DB 테이블 `application_plan_evaluations` (model, prompt_version, rubric_version, temperature, seed, prompt_hash, 입력 원문, 출력 JSON, 캐시 키, 평가일)
- [ ] 답변 평가 시 개인정보 마스킹
- [ ] temperature=0, seed 고정
- [ ] 5차원 score → 10점 환산은 코드에 고정
- [ ] LLM 점수는 "예비점수"로만 표시, 자동 확정 X

### Operation
- [ ] 컷오프 ±1점 전원 운영자 검토
- [ ] 무작위 10~20% 이중검토
- [ ] 첫 회차 100% 검토
- [ ] 집단별 선발률 4/5 rule 점검 (성별·직급·기관 유형·지역·직렬·연령대)
- [ ] 이의신청 시 사람 재처리 절차 운영
- [ ] 5문서 정보공개 대비 비치

---

## 정리

LLM 평가 도입의 **방어선**:
1. "AI 단독 결정 아님 — 운영자 최종 승인"
2. "사전 검증 데이터로 IRR·편향·길이상관 측정 완료"
3. "다차원 rubric + 로그 + 캐시로 재현성 확보"
4. "high-stakes 결정에는 컷오프 인접 100% 검토 + 무작위 이중검토"
5. "한국 공공부문 가이드라인·EU AI Act·NIST AI RMF 인용"

이 5가지가 갖춰지면 인사위·민원·정보공개에 대응 가능. 그렇지 않으면 단독 결정 정당화 어렵고 법적 리스크 발생.
