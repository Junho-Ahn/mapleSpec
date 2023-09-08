import {Chart} from "chart.js";

new Chart(document.querySelector(".traits"), {
	type: "radar",
	data: {
		labels: Object.values(data.character.traits.value).map(x => x.key),
		datasets: [
			{
				label: "성향",
				fill: true,
				backgroundColor: "rgba(100, 149, 237, 0.2)",
				borderColor: "rgba(100, 149, 237, 1)",
				pointBorderColor: "#fff",
				pointBackgroundColor: "rgba(100, 149, 237, 1)",
				data: Object.values(data.character.traits.value).map(x => x.value),
			}
		]
	},
});