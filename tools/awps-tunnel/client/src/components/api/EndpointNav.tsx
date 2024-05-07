import restapiSpec from '../api/restapiSample.json'
import {Tab, TabList, Accordion, AccordionItem, AccordionHeader, AccordionPanel} from "@fluentui/react-components";
import React, {useEffect, useState} from "react";
import {PathItem} from "../../models";

export function EndpointNav({setSelectedPath}: {
	setSelectedPath: React.Dispatch<React.SetStateAction<string | undefined>>
}): React.JSX.Element {
	
	let categories: {
		general: { pathUrl: string, path: PathItem }[],
		groups: { pathUrl: string, path: PathItem }[],
		connections: { pathUrl: string, path: PathItem }[],
		users: { pathUrl: string, path: PathItem }[],
		permissions: { pathUrl: string, path: PathItem }[]
	} = {
		general: [],
		groups: [],
		connections: [],
		users: [],
		permissions: []
	};

	useEffect(() => {
		Object.entries(restapiSpec.paths).forEach(([pathUrl, path]) => {
			const segments = pathUrl.split('/');
			const category = segments[4] || 'general'; // Default to 'general' if no fourth segment
			switch (category) {
				case 'groups':
					categories.groups.push({pathUrl: pathUrl, path: path as PathItem});
					break;
				case 'connections':
					categories.connections.push({pathUrl: pathUrl, path: path as PathItem});
					break;
				case 'users':
					categories.users.push({pathUrl: pathUrl, path: path as PathItem});
					break;
				case 'permissions':
					categories.permissions.push({pathUrl: pathUrl, path: path as PathItem});
					break;
				default:
					categories.general.push({pathUrl: pathUrl, path: path as PathItem});
					break;
			}
		});
	}, []);
	
	return (<div style={{flex: 1, display: "flex"}}>
		<Accordion>
			<TabList onTabSelect={(e, data) => setSelectedPath(data.value as string)} vertical>
				{Object.entries(restapiSpec.paths).map(([pathUrl, path]) => (
					Object.entries(path).map(([method, details]) => (
						<Tab key={`${pathUrl}-${method}`} value={`${pathUrl}-${method}`}>
							{method === 'post' && <div style={{display: "flex"}}>
				  <div style={{
										backgroundColor: "#ffe073",
										color: "white",
										borderRadius: 5,
										paddingLeft: 2,
										paddingRight: 2,
										margin: 2
									}}>POST
				  </div>
				  <div>{details.operationId.replace("WebPubSub_", "")}</div>
			  </div>}
							{method === 'put' && <div style={{display: "flex"}}>
				  <div style={{
										backgroundColor: "#4385d9",
										color: "white",
										borderRadius: 5,
										paddingLeft: 2,
										paddingRight: 2,
										margin: 2
									}}>PUT
				  </div>
				  <div>{details.operationId.replace("WebPubSub_", "")}</div>
			  </div>}
							{method === 'delete' && <div style={{display: "flex"}}>
				  <div
					  style={{
												backgroundColor: "#f27263",
												color: "white",
												borderRadius: 5,
												paddingLeft: 2,
												paddingRight: 2,
												margin: 2
											}}>DELETE
				  </div>
				  <div>{details.operationId.replace("WebPubSub_", "")}</div>
			  </div>}
							{method === 'head' && <div style={{display: "flex"}}>
				  <div style={{
										backgroundColor: "#a887c9",
										color: "white",
										borderRadius: 5,
										paddingLeft: 2,
										paddingRight: 2,
										margin: 2
									}}>HEAD
				  </div>
				  <div>{details.operationId.replace("WebPubSub_", "")}</div>
			  </div>}
						</Tab>
					))
				
				))}
			</TabList>
		</Accordion>
	
	</div>)
}
