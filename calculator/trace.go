package calculator

import (
	"github.com/Vilsol/timeless-jewels/data"
)

// AlternateLookupTraceResult описывает, по каким ключам и пулам данных ищется альтернатива
// (то же, что использует Calculate до RNG).
type AlternateLookupTraceResult struct {
	LookupSummary string `json:"lookupSummary"`

	PassiveTableIndex uint32 `json:"passiveTableIndex"`
	PassiveGraphID    uint32 `json:"passiveGraphId"`
	PassiveRowId      string `json:"passiveRowId"`
	PassiveName       string `json:"passiveName"`
	IsKeystone        bool   `json:"isKeystone"`
	IsNotable         bool   `json:"isNotable"`
	IsJewelSocket     bool   `json:"isJewelSocket"`
	StatIndices       []uint32 `json:"statIndices"`

	PassiveSkillType string `json:"passiveSkillType"`

	JewelType    uint32 `json:"jewelType"`
	Conqueror    string `json:"conqueror"`
	ConquerorRow struct {
		Index   uint32 `json:"index"`
		Version uint32 `json:"version"`
	} `json:"conquerorRow"`

	AlternateTreeVersionKey uint32 `json:"alternateTreeVersionKey"`
	AlternateTreeVersionId  string `json:"alternateTreeVersionId"`
	TreeRules               struct {
		NotableReplacementSpawnWeight          uint32 `json:"notableReplacementSpawnWeight"`
		MinimumAdditions                       uint32 `json:"minimumAdditions"`
		MaximumAdditions                       uint32 `json:"maximumAdditions"`
		AreSmallAttributePassiveSkillsReplaced bool   `json:"areSmallAttributePassiveSkillsReplaced"`
		AreSmallNormalPassiveSkillsReplaced    bool   `json:"areSmallNormalPassiveSkillsReplaced"`
	} `json:"treeRules"`

	SeedUI        uint32 `json:"seedUi"`
	SeedForRNG    uint32 `json:"seedForRng"`
	ValidForAlter bool   `json:"validForAlteration"`

	ReplacePoolCount   int      `json:"replacePoolCount"`
	ReplacePoolSampleIds []string `json:"replacePoolSampleIds"`
	AdditionPoolCount  int      `json:"additionPoolCount"`
	AdditionSampleIds  []string `json:"additionPoolSampleIds"`
}

func passiveSkillTypeName(t data.PassiveSkillType) string {
	switch t {
	case data.None:
		return "None"
	case data.SmallAttribute:
		return "SmallAttribute"
	case data.SmallNormal:
		return "SmallNormal"
	case data.Notable:
		return "Notable"
	case data.KeyStone:
		return "KeyStone"
	case data.JewelSocket:
		return "JewelSocket"
	default:
		return "Unknown"
	}
}

func sampleStringsFromAlternateSkills(skills []*data.AlternatePassiveSkill, n int) []string {
	out := make([]string, 0, n)
	for i, s := range skills {
		if i >= n {
			break
		}
		if s != nil {
			out = append(out, s.ID)
		}
	}
	return out
}

func sampleStringsFromAlternateAdditions(adds []*data.AlternatePassiveAddition, n int) []string {
	out := make([]string, 0, n)
	for i, a := range adds {
		if i >= n {
			break
		}
		if a != nil {
			out = append(out, a.ID)
		}
	}
	return out
}

// AlternateLookupTrace возвращает цепочку данных, по которой Calculate выбирает пулы замен и дополнений.
func AlternateLookupTrace(passiveID uint32, seed uint32, timelessJewelType data.JewelType, conqueror data.Conqueror) AlternateLookupTraceResult {
	out := AlternateLookupTraceResult{
		PassiveTableIndex: passiveID,
		JewelType:         uint32(timelessJewelType),
		Conqueror:         string(conqueror),
		SeedUI:            seed,
		LookupSummary:     "Пулы: GetApplicableAlternatePassiveSkills(passiveSkillType, alternateTreeVersion.Index) и GetApplicableAlternatePassiveAdditions(...); RNG как в upstream Vilsol/timeless-jewels.",
	}

	ps := data.GetPassiveSkillByIndex(passiveID)
	if ps == nil {
		out.LookupSummary = "GetPassiveSkillByIndex: nil (неверный passiveTableIndex)"
		return out
	}

	out.PassiveGraphID = ps.PassiveSkillGraphID
	out.PassiveRowId = ps.ID
	out.PassiveName = ps.Name
	out.IsKeystone = ps.IsKeystone
	out.IsNotable = ps.IsNotable
	out.IsJewelSocket = ps.IsJewelSocket
	out.StatIndices = ps.StatIndices

	st := data.GetPassiveSkillType(ps)
	out.PassiveSkillType = passiveSkillTypeName(st)
	out.ValidForAlter = data.IsPassiveSkillValidForAlteration(ps)

	ver := data.GetAlternateTreeVersionIndex(uint32(timelessJewelType))
	if ver == nil {
		out.LookupSummary = "GetAlternateTreeVersionIndex: nil"
		return out
	}
	out.AlternateTreeVersionKey = ver.Index
	out.AlternateTreeVersionId = ver.ID
	out.TreeRules.NotableReplacementSpawnWeight = ver.NotableReplacementSpawnWeight
	out.TreeRules.MinimumAdditions = ver.MinimumAdditions
	out.TreeRules.MaximumAdditions = ver.MaximumAdditions
	out.TreeRules.AreSmallAttributePassiveSkillsReplaced = ver.AreSmallAttributePassiveSkillsReplaced
	out.TreeRules.AreSmallNormalPassiveSkillsReplaced = ver.AreSmallNormalPassiveSkillsReplaced

	cq := data.TimelessJewelConquerors[timelessJewelType][conqueror]
	if cq == nil {
		out.LookupSummary = "TimelessJewelConquerors[jewel][conqueror]: nil"
		return out
	}
	out.ConquerorRow.Index = cq.Index
	out.ConquerorRow.Version = cq.Version

	tj := data.TimelessJewel{
		Seed:                   seed,
		AlternateTreeVersion:   ver,
		TimelessJewelConqueror: cq,
	}
	out.SeedForRNG = tj.GetSeed()

	repl := data.GetApplicableAlternatePassiveSkills(ps, tj)
	adds := data.GetApplicableAlternatePassiveAdditions(ps, tj)
	out.ReplacePoolCount = len(repl)
	out.AdditionPoolCount = len(adds)
	out.ReplacePoolSampleIds = sampleStringsFromAlternateSkills(repl, 12)
	out.AdditionSampleIds = sampleStringsFromAlternateAdditions(adds, 12)

	return out
}
