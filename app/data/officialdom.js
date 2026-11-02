window.__OFFICIALDOM__ = {
  rankOrder: ["正一品", "从一品", "正二品", "从二品", "正三品", "从三品", "正四品", "从四品", "正五品", "从五品", "正六品", "从六品", "正七品", "从七品", "正八品", "从八品", "正九品", "从九品", "未入流", "—"],
  central: {
    title: "中央官制",
    note: "洪武十三年废中书省与丞相后，六部、都察院、五军都督府等构成中央权力骨架；永乐以后内阁逐渐成为事实上的中枢。",
    tree: [
      { id: "emperor", name: "皇帝", rank: "—", role: "国家最高统治者", note: "决策、任免、军事与祭祀的最高权力来源。" },
      { id: "zhongshu", name: "中书省", rank: "正一品", role: "左、右丞相", validTo: 1380, note: "洪武十三年胡惟庸案后废中书省，罢丞相。", children: [
        { name: "平章政事", rank: "从一品", role: "宰辅" },
        { name: "左、右丞", rank: "正二品", role: "宰辅" },
        { name: "参知政事", rank: "从二品", role: "宰辅" }
      ] },
      { id: "neige", name: "内阁", rank: "正五品", role: "大学士", validFrom: 1402, note: "永乐初设，仁宣以后票拟批答，事实上的中枢。", children: [
        { name: "中极殿/建极殿/文华殿/武英殿/文渊阁/东阁大学士", rank: "正五品", role: "大学士", note: "加官至一品者尊称宰辅。" },
        { name: "首辅", rank: "正五品", role: "内阁首辅", note: "嘉靖以后内阁首位，权任最重。" }
      ] },
      { id: "liubu", name: "六部", rank: "正二品", role: "尚书", note: "吏、户、礼、兵、刑、工六部，各设尚书、左右侍郎。", children: [
        { name: "吏部", rank: "正二品", role: "尚书", note: "掌文官铨选、考课、封勋。" },
        { name: "户部", rank: "正二品", role: "尚书", note: "掌全国户口、田赋、仓储、漕运。" },
        { name: "礼部", rank: "正二品", role: "尚书", note: "掌礼仪、祭祀、科举、贡举。" },
        { name: "兵部", rank: "正二品", role: "尚书", note: "掌武官选授、地图、军令、驿传。" },
        { name: "刑部", rank: "正二品", role: "尚书", note: "掌天下刑名、复核重案。" },
        { name: "工部", rank: "正二品", role: "尚书", note: "掌营造、水利、屯田、工役。" }
      ] },
      { id: "duchayuan", name: "都察院", rank: "正二品", role: "左、右都御史", note: "最高监察机关，与六部并称“部院”。", children: [
        { name: "左、右副都御史", rank: "正三品", role: "副都御史" },
        { name: "左、右佥都御史", rank: "正四品", role: "佥都御史" },
        { name: "十三道监察御史", rank: "正七品", role: "监察御史", note: "分道监察地方与在京衙门。" }
      ] },
      { id: "tongzheng", name: "通政使司", rank: "正三品", role: "通政使", note: "掌内外章奏、封驳与申诉。" },
      { id: "dalisi", name: "大理寺", rank: "正三品", role: "大理寺卿", note: "掌复审天下刑狱，与刑部、都察院合称“三法司”。" },
      { id: "hanlin", name: "翰林院", rank: "正五品", role: "学士", note: "掌制诰、史册、文翰，储备高级文官。" },
      { id: "guozijian", name: "国子监", rank: "从四品", role: "祭酒", note: "最高学府与教育管理机构。" },
      { id: "taichang", name: "太常寺", rank: "正三品", role: "卿", note: "掌祭祀礼乐。" },
      { id: "guanglu", name: "光禄寺", rank: "从三品", role: "卿", note: "掌宫廷膳羞、祭祀供品。" },
      { id: "taipu", name: "太仆寺", rank: "从三品", role: "卿", note: "掌马政、牧监。" },
      { id: "honglu", name: "鸿胪寺", rank: "正四品", role: "卿", note: "掌朝会、宾客、礼仪。" },
      { id: "shangbao", name: "尚宝司", rank: "正五品", role: "卿", note: "掌宝玺、符牌、印章。" },
      { id: "qintian", name: "钦天监", rank: "正五品", role: "监正", note: "掌天文、历法、占候。" },
      { id: "taiyiyuan", name: "太医院", rank: "正五品", role: "院使", note: "掌宫廷医疗与医政。" },
      { id: "wujun", name: "五军都督府", rank: "正一品", role: "左、右都督", note: "中、左、右、前、后五军都督府，分领都司卫所。", children: [
        { name: "都督同知", rank: "从一品", role: "都督同知" },
        { name: "都督佥事", rank: "正二品", role: "都督佥事" }
      ] },
      { id: "jinyiwei", name: "锦衣卫", rank: "正三品", role: "指挥使", note: "亲军卫，掌侍卫、缉捕、诏狱。" },
      { id: "liuke", name: "六科", rank: "正七品", role: "都给事中", note: "吏、户、礼、兵、刑、工六科，掌封驳、监察六部。", children: [
        { name: "给事中", rank: "从七品", role: "给事中" }
      ] }
    ]
  },
  local: {
    title: "地方官制",
    note: "省级以都、布、按三司并立；府、州、县分级管理。巡抚、总督原为差遣，明中后期逐渐成为地方高层主官。",
    tree: [
      { id: "buzheng", name: "承宣布政使司", rank: "从二品", role: "左、右布政使", note: "一省民政、财政与人事总汇。", children: [
        { name: "左、右参政", rank: "从三品", role: "参政" },
        { name: "左、右参议", rank: "从四品", role: "参议" }
      ] },
      { id: "anchashi", name: "提刑按察使司", rank: "正三品", role: "按察使", note: "掌一省刑名、按劾与驿传。", children: [
        { name: "副使", rank: "正四品", role: "副使" },
        { name: "佥事", rank: "正五品", role: "佥事" }
      ] },
      { id: "duzhihui", name: "都指挥使司", rank: "正二品", role: "都指挥使", note: "掌一省军事与卫所。", children: [
        { name: "都指挥同知", rank: "从二品", role: "都指挥同知" },
        { name: "都指挥佥事", rank: "正三品", role: "都指挥佥事" }
      ] },
      { id: "xunfu", name: "巡抚", rank: "正三品（加衔）", role: "巡抚", validFrom: 1430, note: "原为临时差遣，明中后期渐为地方最高长官之一。" },
      { id: "fu", name: "府", rank: "正四品", role: "知府", note: "府为一府行政长官，辖州、县。", children: [
        { name: "同知", rank: "正五品", role: "同知" },
        { name: "通判", rank: "正六品", role: "通判" },
        { name: "推官", rank: "正七品", role: "推官" }
      ] },
      { id: "zhou", name: "州", rank: "从五品", role: "知州", note: "直隶州与属州地位不同，属州多隶于府。", children: [
        { name: "同知", rank: "从六品", role: "同知" },
        { name: "判官", rank: "从七品", role: "判官" }
      ] },
      { id: "xian", name: "县", rank: "正七品", role: "知县", note: "亲民之官，掌一县赋役、狱讼、教化。", children: [
        { name: "县丞", rank: "正八品", role: "县丞" },
        { name: "主簿", rank: "正九品", role: "主簿" },
        { name: "典史", rank: "未入流", role: "典史" }
      ] },
      { id: "wei", name: "卫所", rank: "正三品", role: "卫指挥使", note: "卫所军屯与地方防御系统，听命于都司、五军都督府。", children: [
        { name: "指挥同知", rank: "从三品", role: "指挥同知" },
        { name: "千户", rank: "正五品", role: "千户" },
        { name: "百户", rank: "正六品", role: "百户" }
      ] },
      { id: "tusi", name: "土司/羁縻", rank: "从三品", role: "宣慰使", note: "西南、西北少数民族地区，因俗而治。", children: [
        { name: "宣抚使", rank: "从四品", role: "宣抚使" },
        { name: "安抚使", rank: "从五品", role: "安抚使" },
        { name: "长官", rank: "正六品", role: "长官" }
      ] },
      { id: "xunjian", name: "巡检司", rank: "从九品", role: "巡检", note: "设于关隘、要津，掌盘诘、巡捕。" },
      { id: "yi", name: "驿", rank: "未入流", role: "驿丞", note: "掌驿站邮传、夫马供应。" },
      { id: "jiaozhi", name: "交趾布政使司", rank: "从二品", role: "左、右布政使", validFrom: 1407, validTo: 1427, note: "永乐五年设，宣德二年废，明代省级政区中的短置。" },
      { id: "guizhou", name: "贵州布政使司", rank: "从二品", role: "左、右布政使", validFrom: 1413, note: "永乐十一年置，贵州成为独立省级政区。" },
      { id: "yunyang", name: "郧阳府", rank: "正四品", role: "知府", validFrom: 1476, note: "成化十二年置，安置荆襄流民、加强山区治理。" }
    ]
  },
  levelPosts: {
    "capital-region": [
      { post: "府尹", rank: "正三品", note: "顺天府/应天府主官" },
      { post: "府丞", rank: "正四品", note: "佐贰官" },
      { post: "治中", rank: "正五品", note: "掌文书、仓场等" },
      { post: "通判", rank: "正六品", note: "分掌粮运、水利、诉讼" },
      { post: "推官", rank: "正七品", note: "掌刑名" }
    ],
    province: [
      { post: "左、右布政使", rank: "从二品", note: "一省民政财政最高长官" },
      { post: "按察使", rank: "正三品", note: "一省刑名监察长官" },
      { post: "都指挥使", rank: "正二品", note: "一省军事长官" },
      { post: "巡抚", rank: "正三品（加衔）", note: "明中后期地方最高长官之一" }
    ],
    prefecture: [
      { post: "知府", rank: "正四品", note: "一府主官" },
      { post: "同知", rank: "正五品", note: "府佐贰官" },
      { post: "通判", rank: "正六品", note: "分掌粮运、水利、诉讼" },
      { post: "推官", rank: "正七品", note: "掌刑名" }
    ],
    department: [
      { post: "知州", rank: "从五品", note: "一州主官" },
      { post: "同知", rank: "从六品", note: "州佐贰官" },
      { post: "判官", rank: "从七品", note: "州佐贰官" }
    ],
    county: [
      { post: "知县", rank: "正七品", note: "一县主官" },
      { post: "县丞", rank: "正八品", note: "县佐贰官" },
      { post: "主簿", rank: "正九品", note: "掌粮马、巡捕等" },
      { post: "典史", rank: "未入流", note: "掌狱囚、缉捕" }
    ],
    military: [
      { post: "卫指挥使", rank: "正三品", note: "卫主官" },
      { post: "指挥同知", rank: "从三品", note: "卫佐贰官" },
      { post: "千户", rank: "正五品", note: "千户所主官" },
      { post: "百户", rank: "正六品", note: "百户所主官" }
    ],
    jimi: [
      { post: "宣慰使", rank: "从三品", note: "宣慰司主官" },
      { post: "宣抚使", rank: "从四品", note: "宣抚司主官" },
      { post: "安抚使", rank: "从五品", note: "安抚司主官" },
      { post: "长官", rank: "正六品", note: "长官司主官" }
    ]
  }
};
