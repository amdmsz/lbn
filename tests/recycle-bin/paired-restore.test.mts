import assert from "node:assert/strict";
import test from "node:test";
import {
  getRecycleCascadeSource,
  isRecycleCascadeFrom,
} from "../../lib/recycle-bin/paired-restore.ts";

test("cascade snapshot 会解析出来源对象", () => {
  const source = getRecycleCascadeSource({
    cascadeSourceTargetType: "LEAD",
    cascadeSourceTargetId: "lead_1",
    cascadeSourceTitle: "测试线索",
  });

  assert.deepEqual(source, {
    targetType: "LEAD",
    targetId: "lead_1",
  });
});

test("cascade snapshot 只匹配同一个来源对象", () => {
  const snapshot = {
    cascadeSourceTargetType: "LEAD",
    cascadeSourceTargetId: "lead_1",
  };

  assert.equal(
    isRecycleCascadeFrom(snapshot, {
      targetType: "LEAD",
      targetId: "lead_1",
    }),
    true,
  );

  assert.equal(
    isRecycleCascadeFrom(snapshot, {
      targetType: "LEAD",
      targetId: "lead_2",
    }),
    false,
  );
});

test("非 cascade snapshot 不会误判为成对恢复对象", () => {
  assert.equal(getRecycleCascadeSource(null), null);
  assert.equal(getRecycleCascadeSource({ cascadeSourceTargetType: "LEAD" }), null);
  assert.equal(
    isRecycleCascadeFrom(
      {
        blockers: [],
      },
      {
        targetType: "LEAD",
        targetId: "lead_1",
      },
    ),
    false,
  );
});
