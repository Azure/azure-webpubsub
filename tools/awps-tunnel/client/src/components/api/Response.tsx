import React, {useEffect, useState} from "react";
import {APIResponse, ResponseSchema} from "../../models";
import {Card, CardHeader, CardPreview, Label, Tab, TabList} from "@fluentui/react-components";
import type {
	SelectTabData,
	SelectTabEvent,
	TabValue,
} from "@fluentui/react-components";
// @ts-ignore, dependency for library, don't remove
import locale from "react-json-editor-ajrm/locale/en";
import JSONInput from "react-json-editor-ajrm";


export function Response({responseSchema, response}: {
	responseSchema: { [status: string]: ResponseSchema },
	response: APIResponse | undefined
}): React.JSX.Element {
	const [selectedStatus, setSelectedStatus] = useState<TabValue>();
	useEffect(() => {
	}, [response]);
	const onTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
		setSelectedStatus(data.value);
	};
	return (
		<div className="d-flex">
			<div style={{flex: 3}}>
				<Card className="m-2 w-95">
					<CardHeader header={<b className="fs-6">Response</b>}/>
					{response &&
			  <CardPreview className="d-flex flex-column align-items-start p-3">
								{response && (
									<Label className={response.status.toString()[0] === "2" ? "text-success" : "text-danger"}>
										{response.status} {response.status.toString()[0] !== "2" && response.code}
									</Label>
								)}
								{response.code && <JSONInput locale={locale} placeholder={response}
				                             colors={{
									                             default: "black",
									                             background: "white",
									                             keys: "#8b1853",
									                             string: "#4a50a3",
									                             colon: "black"
								                             }} height={"auto"} viewOnly={true} confirmGood={false}/>}
			  </CardPreview>}
				</Card>
			</div>
			<div style={{flex: 1}}>
				<Card className="m-2 w-95">
					<CardHeader header={<b className="fs-6">Response Schema</b>}/>
					<CardPreview>
						<TabList className="d-flex" selectedValue={selectedStatus} onTabSelect={onTabSelect}>
							{Object.entries(responseSchema).map(([status], key) => (
								<Tab id={status} value={status} key={key}>
									<div className={status[0] === "2" ? "text-success" : "text-danger"}>{status}</div>
								</Tab>
							))}
						</TabList>
						{Object.entries(responseSchema).map(([status, response]) => (
							status === selectedStatus && <div style={{margin: 10}}>{response.description}</div>
						))}
					</CardPreview>
				</Card>
			</div>
		</div>
	)
}
