import restapiSpec from '../api/restapiSample.json'
import {
	Tab,
	TabList,
	Accordion,
	AccordionItem,
	AccordionHeader,
	AccordionPanel,
	Label
} from "@fluentui/react-components";
import React, {useEffect, useState} from "react";
import {PathItem} from "../../models";

export function EndpointNav({setSelectedPath}: {
	setSelectedPath: React.Dispatch<React.SetStateAction<string | undefined>>
}): React.JSX.Element {
	const [categories, setCategories] = useState<{
		general: { pathUrl: string, path: PathItem }[];
		groups: { pathUrl: string, path: PathItem }[];
		connections: { pathUrl: string, path: PathItem }[];
		users: { pathUrl: string, path: PathItem }[];
		permissions: { pathUrl: string, path: PathItem }[];
	}>();
	
	useEffect(() => {
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
		setCategories(categories);
	}, []);
	
	return (<div style={{flex: 1, display: "flex"}}>
		
		<TabList onTabSelect={(e, data) => {
			setSelectedPath(data.value as string)
		}} vertical>
			<Accordion multiple>
				{categories && Object.entries(categories).map(([category, path]) => (
					<AccordionItem value={category}>
						<AccordionHeader><Label size={"large"}>{category}</Label></AccordionHeader>
						<AccordionPanel>
							{Object.entries(path).map(([pathUrl, p]) => (
								Object.entries(p.path).map(([method, details]) => (
									<Tab key={`${p.pathUrl}-${method}`} value={`${p.pathUrl}-${method}`}>
										{method === 'post' && <div style={{display: "flex"}}>
						<div style={{
													color: "#ffd02b",
													fontSize: 15, marginRight: 5
												}}>POST
						</div>
						<div>{details.operationId.replace("WebPubSub_", "")}</div>
					</div>}
										{method === 'put' && <div style={{display: "flex"}}>
						<div style={{color: "#4385d9", fontSize: 15, marginRight: 5}}>PUT
						</div>
						<div>{details.operationId.replace("WebPubSub_", "")}</div>
					</div>}
										{method === 'delete' && <div style={{display: "flex"}}>
						<div
							style={{color: "#f27263", fontSize: 15, marginRight: 5}}>DELETE
						</div>
						<div>{details.operationId.replace("WebPubSub_", "")}</div>
					</div>}
										{method === 'head' && <div style={{display: "flex"}}>
						<div style={{
													color: "#a887c9",
													fontSize: 15, marginRight: 5
												}}>HEAD
						</div>
						<div>{details.operationId.replace("WebPubSub_", "")}</div>
					</div>}
									</Tab>
								))
							))}
						</AccordionPanel>
					</AccordionItem>
				))}
			</Accordion>
		</TabList>
	
	
	</div>)
}
