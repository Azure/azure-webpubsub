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

const methodColors: { [method: string]: string } = {
	post: "#ffd02b",
	put: "#4385d9",
	delete: "#f27263",
	head: "#a887c9"
};
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
	
	return (<div className="d-flex overflow-hidden" style={{flex: 1}}>
		<TabList onTabSelect={(e, data) => {
			setSelectedPath(data.value as string)
		}} vertical>
			<Accordion multiple>
				{categories && Object.entries(categories).map(([category, path]) => (
					<AccordionItem value={category}>
						<AccordionHeader><Label size={"large"}>{category}</Label></AccordionHeader>
						<AccordionPanel>
							{Object.entries(path).map(([url, {pathUrl, path}]) => (
								Object.entries(path).map(([method, details]) => (
									<Tab key={`${pathUrl}-${method}`} value={`${pathUrl}-${method}`}>
										<div className="d-flex">
											<div
												className="fs-6 me-2"
												style={{color: methodColors[method]}}>{method.toUpperCase()}</div>
											<div>{details.operationId.replace("WebPubSub_", "")}</div>
										</div>
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
