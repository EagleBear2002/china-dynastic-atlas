(() => {
  const OFF = window.__OFFICIALDOM__;
  if (!OFF) return;
  OFF.central.title = "中央官制";
  OFF.central.note = "清代中枢以军机处为核心，内阁、六部、都察院与理藩院等分掌政务；军机大臣由皇帝特简，逐渐成为事实上的最高机要机构。";
  OFF.central.tree = [
    { id: "emperor", name: "皇帝", rank: "—", role: "国家最高统治者", note: "清代皇权高度集中，军国大政由皇帝最终裁决。" },
    { id: "junjichu", name: "军机处", rank: "正一品", role: "军机大臣", validFrom: 1729, note: "雍正以后设立，承旨办理军国要务，逐渐成为实际中枢。" },
    ...OFF.central.tree.filter((node) => node.id !== "emperor")
  ];
  OFF.local.title = "地方官制";
  OFF.local.note = "清代地方以总督、巡抚为最高军政长官，下设布政使、按察使，府州县分层管理；边疆另设将军、办事大臣、驻藏大臣等。";
  window.__OFFICIALDOM__ = OFF;
})();
