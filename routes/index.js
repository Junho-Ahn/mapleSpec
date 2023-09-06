const express = require("express");
const {MapleUtilsParser} = require("mapleutils-parser-js");
const router = express.Router();
const fs = require("fs");

/* GET home page. */
router.get("/", async(req, res, next) => {
	const parser = MapleUtilsParser.new();
	const rawData = await parser.getCharacter({
		name: "pinkjulia",
		cash: true,
		pet: true,
		equip: true,
		symbol: true
	});
	
	const nameDefinition = JSON.parse(fs.readFileSync("./public/data/nameDefinition.json", "utf-8"));
	const statDefinition = JSON.parse(fs.readFileSync("./public/data/statDefinition.json", "utf-8"));
	
	const {mainStat, subStat, atk} = statDefinition.find(x => x.contains.includes(rawData.job));
	const wholeStat = [...mainStat, ...subStat];
	const [upperMainStat, upperSubStat] = [
		mainStat,
		subStat
	].map(x => x.map(y => y.charAt(0).toUpperCase() + y.slice(1)));
	const upperAtk = atk.charAt(0).toUpperCase() + atk.slice(1);
	
	const effectiveStat = [
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
		`lv9${upperSubStat}`,
		...wholeStat.reduce((array, item) => array.push(item, `${item}P`) && array, [])
	];
	
	const {spec, equipments, arcanes, cashEquipments, petEquipments} = rawData;
	
	const summary = {
		ignoreDef: 0,
		bossDmg: 0,
		critDmg: 0
	};
	let weaponCounted = false;
	
	for(const stat of ["allStat", atk, ...wholeStat]) {
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
		
		summary[`hard_${stat}`] += +(spec.hypers[stat] ?? 0);
	}
	
	for(const equipment of [...equipments, ...cashEquipments, ...petEquipments]) {
		if(!weaponCounted && /^.+\(.+무기\)$/.test(equipment.category)) {
			weaponCounted = true;
			if(equipment.soul) {
				let [key, value] = Object.entries(equipment.soul)[0];
				if(["atk", "mAtk"].includes(key)) {
					key += "P";
				}
				summary[key] += value;
			}
		}
		
		for(const type of ["base", "scroll", "flame"]) {
			if(equipment[type]) {
				for(const stat of ["bossDmg", ...wholeStat]) {
					const value = +equipment[type][stat];
					if(!value) {
						continue;
					}
					summary[stat] += value;
				}
				const {ignoreDef} = equipment[type];
				if(ignoreDef) {
					summary.ignoreDef = summary.ignoreDef + (+ignoreDef - summary.ignoreDef * +ignoreDef / 100);
				}
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
		
		if(key === "ignoreDef") {
			value += "%";
		}
		
		if(["bossDmg", "critDmg", "allStatP", "atkP", ...wholeStat.map(x => x + "P")].includes(key)) {
			value += "%p";
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
					{key: nameDefinition.stat[x[0]], value: x[1]}
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
			}
			
			if(Object.values(x.flame).filter(x => x).length > 0) {
				data.options.flame = {
					key: nameDefinition.key.flame,
					value: []
				};
				
				if(x.flame[mainStat]) {
					data.options.flame.value.push(x.flame[mainStat]);
				}
				
				if(x.flame[atk]) {
					data.options.flame.value.push(x.flame[atk]);
				}
				
				if(x.flame.allStatP) {
					data.options.flame.value.push(x.flame.allStatP + "%p");
				}
				
				data.options.flame.value = data.options.flame.value.join(" + ");
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
				for(const stat of ["allStatP", atk, ...wholeStat]) {
					const value = x[key][stat] ?? 0;
					if(!value) {
						continue;
					}
					data[stat] ??= {};
					data[stat][key] = +value;
				}
			}
			
			for(const key of ["potential", "additional"]) {
				if(!x[key]) {
					continue;
				}
				data.potential ??= {};
				data.options.potential ??= {};
				const valueList = x[key]["effects"];
				for(const value of valueList) {
					const [_key, _value] = Object.entries(value)[0];
					if(effectiveStat.includes(_key)) {
						data.potential[_key] ??= 0;
						data.potential[_key] += +_value;
						
						if(_key === "allStatP") {
							data.options["potential"][mainStat + "P"] ??= 0;
							data.options["potential"][mainStat + "P"] += +_value;
						} else if(_key === "ignoreDef") {
							data.options["potential"][_key] ??= [];
							data.options["potential"][_key].push(_value);
						} else {
							data.options["potential"][_key] ??= 0;
							data.options["potential"][_key] += +_value;
						}
					}
				}
			}
			
			if(data.options.potential?.["ignoreDef"]) {
				data.options.potential["ignoreDef"] = data.options.potential["ignoreDef"]
					.reduce((sum, value) => sum + (+value - sum * +value / 100), 0);
			}
			
			for(const key in data.options.potential) {
				let value = data.options.potential[key];
				
				if(key === "ignoreDef") {
					value += "%";
				}
				
				if(["bossDmg", "critDmg", "allStatP", "atkP", ...wholeStat.map(x => x + "P")].includes(key)) {
					value += "%p";
				}
				
				data.options.potential[key] = {
					key: nameDefinition.stat[key],
					value
				};
			}
			
			data.options.text = [];
			for(const key in data.options) {
				const option = Object.values(data.options[key]);
				if(key === "potential") {
					data.options.text.push("잠재능력 " + option.reduce((array, value) => array.push(Object.values(value).join(" ")) && array, []).join(" "));
				}else {
					data.options.text.push(option.join(" "));
				}
			}
			console.log(data.options);
			
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
