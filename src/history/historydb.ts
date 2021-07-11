import { UUID } from "@/types";
import { ClickHouse } from "clickhouse";

export const clickhouse = new ClickHouse({
	url: 'http://' + process.env["CLICKHOUSE_HOST"],
	port: +process.env["CLICKHOUSE_PORT"],
	debug: false,
	basicAuth: null,
	isUseGzip: false,
	format: "json", // "json" || "csv" || "tsv"
	raw: false,
	config: {
		// session_id                              : 'session_id if neeed',
		// session_timeout                         : 60,
		output_format_json_quote_64bit_integers : 0,
		enable_http_compression                 : 0,
		database                                : process.env["CLICKHOUSE_DATABASE"],
		date_time_input_format: 'best_effort'

	},
	
});

export var pendingRows: any[][] = [];

export function init() {

	setInterval(async () => {
		if (pendingRows.length) {
			const ws = clickhouse.insert('INSERT INTO kensuke.sessionlog').stream();
			for (let row of pendingRows) {
				await ws.writeRow(row);
			}
			await ws.exec();
			pendingRows = [];
		}
	}, 1000)
	
}

export async function logHistory(sessionId: UUID, dataId: string, severity: 0|1|2|3, event: string, node: string, data: string) {

	pendingRows.push([new Date().toISOString(), sessionId, dataId, severity, event, node, data]);

}
