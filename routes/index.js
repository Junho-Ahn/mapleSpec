const express = require("express");
const {MapleUtilsParser} = require("mapleutils-parser-js");
const router = express.Router();
const fs = require("fs");

/* GET home page. */
router.get("/search/:nickname", async(req, res, next) => {
	const parser = MapleUtilsParser.new();
	
	const getData = async function(count = 0) {
		const data = await parser.getCharacterWithErrors({
			name: req.params.nickname,
			cash: true,
			pet: true,
			equip: true,
			symbol: true
		});
		
		console.log(data);
		if(data.errors !== undefined) {
			if(count < 3) {
				return await getData(++count);
			}else {
				throw new Error("얜 안된다");
			}
		} else {
			return data.data;
		}
	}
	
	const rawData = await getData();
	
	const nameDefinition = JSON.parse(fs.readFileSync("./public/data/nameDefinition.json", "utf-8"));
	const statDefinition = JSON.parse(fs.readFileSync("./public/data/statDefinition.json", "utf-8"));
	
	const useSubStat = true;
	const demonAvenger = rawData.job === "데몬어벤져";
	const isZero = rawData.job === "제로";
	let zeroWeaponCounted = false;
	
	const {mainStat, subStat, atk} = statDefinition.find(x => x.contains.includes(rawData.job));
	const wholeStat = useSubStat ? [...mainStat, ...subStat] : mainStat;
	const upperMainStat = mainStat.map(x => x.charAt(0).toUpperCase() + x.slice(1));
	const upperSubStat = subStat.map(x => x.charAt(0).toUpperCase() + x.slice(1));
	const upperAtk = atk.charAt(0).toUpperCase() + atk.slice(1);
	const percentageTargets = [
		"strP",
		"dexP",
		"intP",
		"lukP",
		"hpP",
		"mpP",
		"atkP",
		"mAtkP",
		"defP",
		"mobDmg",
		"bossDmg",
		"dmg",
		"allStatP",
		"crit",
		"critDmg",
		"buff",
		"statusDmg",
		"meso",
		"drop",
		"reuse",
		"meso",
		"exp",
		"ignoreDef"
	];
	
	let effectiveStat;
	if(demonAvenger) {
		effectiveStat = [
			"bossDmg",
			"dmg",
			"critDmg",
			"ignoreDef",
			atk,
			atk + "P",
			`lvN${upperAtk}`,
			`lv9${upperSubStat}`,
			...wholeStat.reduce((array, item) => array.push(item, `${item}P`) && array, [])
		];
	}else {
		effectiveStat = [
			"allStat",
			"allStatP",
			"bossDmg",
			"dmg",
			"critDmg",
			"ignoreDef",
			atk,
			atk + "P",
			`lvN${upperAtk}`,
			`lv9${upperMainStat}`,
			...wholeStat.reduce((array, item) => array.push(item, `${item}P`) && array, [])
		]
		if(useSubStat) {
			effectiveStat.push(`lv9${upperSubStat}`);
		}
	}
	
	const {spec, equipments, arcanes, cashEquipments, petEquipments} = rawData;
	
	const summary = {
		ignoreDef: 0,
		bossDmg: 0,
		critDmg: 0
	};
	
	for(const stat of [demonAvenger ? null : "allStat", atk, ...wholeStat].filter(x => x !== null)) {
		summary[stat] ??= 0;
		summary[`${stat}P`] ??= 0;
	}
	
	for(const stat of wholeStat) {
		summary[`hard_${stat}`] ??= 0;
		
		for(const symbol of arcanes) {
			const value = symbol.stat[stat];
			if(!value) {
				continue;
			}
			
			summary[`hard_${stat}`] += +value;
		}
		
		if(demonAvenger || stat === "hp") {
			summary[`hpP`] += +(spec.hypers["hpP"] ?? 0);
		}else {
			summary[`hard_${stat}`] += +(spec.hypers[stat] ?? 0);
		}
	}
	
	for(const equipment of [...equipments, ...cashEquipments, ...petEquipments]) {
		const isWeapon = /^.+\(.+무기\)$/.test(equipment.category);
		
		for(const type of ["base", "scroll", "flame"]) {
			if(isZero && isWeapon && zeroWeaponCounted) {
				for(const stat of [atk, ...wholeStat]) {
					summary[stat]++;
				}
				for(const stat of ["bossDmg", "dmg", "allstatP"]) {
					const value = +equipment[type][stat];
					if(!value) {
						continue;
					}
					summary[stat] += value;
				}
				break;
			}
			
			if(equipment[type]) {
				for(const stat of [atk, "bossDmg", "dmg", "allstatP", ...wholeStat]) {
					const value = +equipment[type][stat];
					if(!value) {
						continue;
					}
					summary[stat] += value;
				}
				const {ignoreDef} = equipment[type];
				if(ignoreDef) {
					summary.ignoreDef = summary.ignoreDef + (+ignoreDef - summary.ignoreDef * +ignoreDef / 100);
					summary.ignoreDef = Math.round(summary.ignoreDef * 1000) / 1000;
				}
			}
		}
		
		weapon: if(isWeapon) {
			if(isZero) {
				if(zeroWeaponCounted) {
					break weapon;
				}else {
					zeroWeaponCounted = true;
				}
			}
			if(equipment.soul) {
				let [key, value] = Object.entries(equipment.soul)[0];
				if(["atk", "mAtk"].includes(key)) {
					key += "P";
				}
				summary[key] += value;
			}
		}
		
		for(const type of ["potential", "additional"]) {
			for(const effect of equipment[type]?.["effects"] ?? []) {
				const [key, value] = Object.entries(effect)[0];
				if(key === "ignoreDef") {
					summary.ignoreDef = summary.ignoreDef + (+value - summary.ignoreDef * +value / 100);
				} else if(Object.keys(summary).includes(key)) {
					summary[key] += +value;
				}
			}
		}
	}
	
	for(const key in summary) {
		let value = summary[key];
		
		if(percentageTargets.includes(key)) {
			value += "%";
		}
		
		summary[key] = {
			key: nameDefinition.stat[key],
			value
		};
	}
	
	const characterData = {
		character: {
			name: {
				key: nameDefinition.key.charName,
				value: rawData.name
			},
			class: {
				key: nameDefinition.key.class,
				value: rawData.job
			},
			level: {
				key: nameDefinition.key.level,
				value: rawData.level
			},
			traits: {
				key: nameDefinition.key.traits,
				value: Object.fromEntries(Object.entries(rawData.traits).map(x => [
					x[0],
					{key: nameDefinition.stat[x[0]], value: x[1]}
				]))
			},
			abilities: {
				key: nameDefinition.key.abilities,
				value: Object.fromEntries(Object.entries(rawData.spec.abilities).map(x => [
					x[0],
					{
						key: nameDefinition.stat[x[0]],
						value: percentageTargets.includes(x[0]) ? `${x[1]}%` : x[1]
					}
				]))
			}
		},
		characterImage: rawData.imageUrl,
		summary
	};
	
	const equipmentData = {
		normal: equipments.map(x => {
			const data = {
				options: {}
			};
			
			if(x.star) {
				data.options.star = {
					key: nameDefinition.key.star,
					value: x.star
				};
			}else {
				data.options.star = {
					key: nameDefinition.key.star,
					value: "⋯"
				};
			}
			
			if(Object.values(x.flame).filter(x => x).length > 0) {
				data.options.flame = {
					key: nameDefinition.key.flame,
					value: []
				};
				
				for(const stat of mainStat) {
					if(x.flame[stat]) {
						data.options.flame.value.push((nameDefinition.shorthand[stat] ?? nameDefinition.stat[stat]) + x.flame[stat]);
					}
				}
				
				if(x.flame[atk]) {
					data.options.flame.value.push(nameDefinition.shorthand[atk] + x.flame[atk]);
				}
				
				if(!demonAvenger && x.flame.allStatP) {
					data.options.flame.value.push(nameDefinition.shorthand["allStatP"] + x.flame.allStatP + "%");
				}
				
				if(useSubStat) {
					for(const stat of subStat) {
						if(x.flame[stat]) {
							data.options.flame.value.push((nameDefinition.shorthand[stat] ?? nameDefinition.stat[stat]) + x.flame[stat]);
						}
					}
				}
				
				data.options.flame.value = data.options.flame.value.join(" + ");
			}else {
				data.options.flame = {
					key: nameDefinition.key.flame,
					value: "⋯"
				};
			}
			
			for(const key of ["name", "imageUrl", "star"]) {
				if(!x[key]) {
					continue;
				}
				data[key] = x[key];
			}
			
			for(const key of ["base", "scroll", "flame"]) {
				if(!x[key]) {
					continue;
				}
				for(const stat of [demonAvenger ? null : "allStatP", atk, ...wholeStat].filter(x => x !== null)) {
					const value = x[key][stat] ?? 0;
					if(!value) {
						continue;
					}
					data[stat] ??= {};
					data[stat][key] = +value;
				}
			}
			
			for(const type of ["potential", "additional"]) {
				data.potential ??= {};
				if(!x[type]) {
					data.options[type] ??= {
						grade: "normal"
					};
					continue;
				}
				data.options[type] ??= {
					grade: x[type]["grade"]
				};
				const valueList = x[type]["effects"];
				for(const value of valueList) {
					const [key, _value] = Object.entries(value)[0];
					if(effectiveStat.includes(key)) {
						data.potential[key] ??= 0;
						data.potential[key] += +_value;
						
						if(key === "allStatP") {
							if(useSubStat) {
								data.options[type]["allStatP"] ??= 0;
								data.options[type]["allStatP"] += +_value;
							}else {
								data.options[type][mainStat + "P"] ??= 0;
								data.options[type][mainStat + "P"] += +_value;
							}
						} else if(key === "ignoreDef") {
							data.options[type][key] ??= [];
							data.options[type][key].push(_value);
						} else {
							data.options[type][key] ??= 0;
							data.options[type][key] += +_value;
						}
					}
				}
				
				if(data.options[type]?.["ignoreDef"]) {
					data.options[type]["ignoreDef"] = data.options[type]["ignoreDef"]
						.reduce((sum, value) => sum + (+value - sum * +value / 100), 0);
				}
				
				for(const key in data.options[type] ?? []) {
					if(key === "grade") {
						continue;
					}
					
					let value = data.options[type][key];
					
					if(percentageTargets.includes(key)) {
						value += "%";
					}
					
					data.options[type][key] = {
						key: key,
						name: nameDefinition.stat[key],
						shorthand: nameDefinition.shorthand[key],
						value
					};
				}
				
				const [, ...rows] = Object.values(data.options[type] ?? {});
				if(rows.length > 0) {
					data.options[type].text = rows.map(x => `${x.shorthand ?? x.name}${x.value}`).join(" ");
				}
			}
			
			if(x["soul"]) {
				let [key, value] = Object.entries(x["soul"])[0];
				
				if(["atk", "mAtk"].includes(key)) {
					key += "P";
				}
				
				if(percentageTargets.includes("key")) {
					value += "%";
				}
				
				data.options.soul = `${nameDefinition.shorthand[key] ?? nameDefinition.stat[key]}${value}`;
			}
			
			return data;
		}),
		cash: [
			...cashEquipments,
			...petEquipments
		],
		symbol: {
			arcane: arcanes
		}
	};
	
	res.render("index", {title: "Express", data: characterData, equipment: equipmentData, rawData: rawData});
});

module.exports = router;
