# 댓글을 단 다른 사람 글 재게시

2026-10-29 사용자가 “댓글다는 다른사람글도 재게시해”, “내 게시글 자동 댓글은 제외”라고 지시했다. 성공한 일반 자동댓글의 대상 글을 X 기본 재게시로 한 번 공유한다. 내 게시글에 달린 댓글에 답하는 `own_post_*` 작업은 대상 URL이 타인 계정이어도 제외한다. 댓글 작성과 재게시를 구분한다. 2026-11-02 사용자 중단 지시에 따라 창작 게시와 모든 미게시 daily-ten 편성은 중단/취소 상태를 유지한다.

`lib/comment-repost.js`가 `commentHistory`와 `homeVerifiedCommentHistory`의 성공한 자기 답글 URL을 확인한다. `ownPostReplyHistory`의 답글 ID, 작업 source, 내 계정/원글 ID도 함께 제외한다. 활성화 이후 성공 기록만 30초마다 수집한다. 과거 전체 이력을 일괄 재게시하지 않는다.

상태와 중복 방지는 `.data/comment-reposts.json`, 개별 X 검증 근거는 `.data/comment-reposts/원글ID/`에 저장한다. 게시 직전 intent를 남기고 실제 계정·원글 ID·작성자·재게시 확인 메뉴를 검사한다. 이미 `unretweet` 상태인 글은 그대로 둔다. 제출 후 새로 연 원글에서 `unretweet` 상태를 확인해야 완료로 기록한다. 전송 결과가 불확실하면 `verification_required`로 보류하며 다시 누르지 않는다. 재시작 때 `submitting` 상태는 읽기로만 대조한다.

2026-11-02 사용자 지시 “상대방 글 재게시도 헤드레스로 전환해”에 따라 재게시는 댓글 작성 경로와 분리된 전용 headless Chrome9445·프로필 `.data/chrome-profiles/terafabx-comment-repost-9445`·잠금 `terafabx-comment-repost-9445.lock`을 이용한다. `lib/comment-repost-browser.js`는 실제 프로세스의 포트/프로필/headless 옵션을 검증하고,9224에서 브라우저 수준 CDP로 X 인증만 복사한다. 가시 X 작업 탭을 열거나 활성화하지 않고 headed fallback도 없다. 매 쓰기 직전 @terafabXai를 다시 확인한다. 완료/실패 시 작업 탭과 전용 프로세스를 정리하고 잠금을 해제한다. 영수증과 before/after 근거에 실제 브라우저 정보를 기록한다. `mirror-history.json`에는 `canonicalUrl=x-repost:원글ID`, `status=reposted`로 기록하므로 하루 신규 사연 수에 포함되지 않는다.

로컬 API `/api/terafabx/comment-reposts`:

- `GET`: 활성 여부, 실행 중 여부, 대기/완료/실패 이력.
- `POST {"action":"enable"}` 또는 `disable`: 수집·재게시 활성화/중지.
- `POST {"action":"run"}`: 도래 대기 한 건 처리.
- `POST {"action":"run","targetUrl":"https://x.com/계정/status/ID"}`: 성공한 일반 댓글이 이미 있는 특정 원글 한 건 선택. 내 글 답글 제외 조건은 해제되지 않는다.

회귀 검사는 `node --test test/comment-repost.test.js test/comment-repost-browser.test.js`. 실게시 검증은 사용자에게 허용된 정상 댓글 대상에서 수행하고 `receipt.json` 및 실제 X 재게시 상태를 확인한다. 코드 검사만으로 실게시 완료를 선언하지 않는다.

2026-11-02 전환 실검증: 정상 자동댓글이 완료된 `Quuchan55/2117178580686020785`를9445에서 실제 재게시했다. `CreateRetweet` HTTP200·재게시ID `2117241290916290657`, 새 탐색 후 `unretweet`, @terafabXai 계정과 스크린샷, 이력1건 및 중복 실행 `no_pending`을 확인했다. 회귀12건 통과, 기존506개 재게시 기록은 변경 없고 작업 브라우저/잠금을 정리했다. 근거 `.data/comment-repost-headless-2026-11-02/verification.json`. 창작 게시 중단 및 미게시48편 편성 취소를 유지한다.
