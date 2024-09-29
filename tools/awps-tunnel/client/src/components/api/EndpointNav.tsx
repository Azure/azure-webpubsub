import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    Tab,
    TabList
} from "@fluentui/react-components";
import React, { useEffect, useState } from "react";
import { Operation, RESTApi } from "../../models";
import { useDataContext } from "../../providers/DataContext";
import { Badge } from "@fluentui/react-components";

export interface ApiItem{ 
    id: string, 
    pathUrl: string,
    operation: Operation, 
    method: string,
}
interface ApiCategoryItem{
    header: string;
    items: ApiItem[];
}
interface ApiSpec
{
    groups: Record<string, ApiCategoryItem>
    apiMap : Record<string, ApiItem>
}

function getGroups(item: ApiItem, spec: ApiSpec): string[]{
    const groups = Object.keys(spec.groups)
    .filter(i=> item.id.toLowerCase().includes(i));
    return groups.length > 0 ? groups : [Object.keys(spec.groups)[0]];
}
function ToApiSpec(apiSpec: RESTApi) : ApiSpec {
    var spec : ApiSpec = {
        groups:{
            "general": {header: "Default", items: []},
            "groups": {header: "Manage Groups", items: []},
            "connections": {header: "Manage Connections", items: []},
            "users": {header: "Manage Users", items: []},
            "permissions": {header: "Manage Permissions", items: []},
        },
        apiMap: {}
    };
    if (!apiSpec || !apiSpec.paths) return spec;
    Object.entries(apiSpec.paths).forEach(([pathUrl, path]) => {
        Object.entries(path).forEach(([method, operation])=>{
            const item = {id: `${pathUrl}-${method}`, pathUrl, operation, method,};
            spec.apiMap[item.id] = item;
            const groups = getGroups(item, spec);
            groups.forEach((v, i)=>{
                spec.groups[v].items.push(item);
            })
        });
    });

    return spec;
}
export function EndpointNav({ setSelectedItem }: {
    setSelectedItem: React.Dispatch<React.SetStateAction<ApiItem | undefined>>
}): React.JSX.Element {
    const { data } = useDataContext();
    const [categories, setCategories] = useState<ApiSpec>();

    useEffect(() => {
        setCategories(ToApiSpec(data.apiSpec));
    }, [data.apiSpec]);

    return (<div className="d-flex overflow-auto" style={{ flex: 1 }}>
        <TabList onTabSelect={(_e, data) => {
            const selectedId = data.value as string;
            setSelectedItem(categories?.apiMap[selectedId])
        }} vertical>
            <Accordion multiple defaultOpenItems="general" >
                {categories && Object.entries(categories.groups).map(([category, item], index) => (
                    <AccordionItem key={index} value={category}>
                        <AccordionHeader>{item.header}</AccordionHeader>
                        <AccordionPanel>
                            {item.items.map((i) => (
                                <Tab key={i.id} value={i.id}>
                                    <span>{i.operation.operationId.replace("WebPubSub_", "")}
                                        <Badge size="small" color={getbadgeColors(i.method)}>{i.method.toUpperCase()}</Badge></span>
                                        
                                </Tab>
                            ))}
                        </AccordionPanel>
                    </AccordionItem>
                ))}
            </Accordion>
        </TabList>
    </div>)
}

function getbadgeColors(method: string) {
    switch (method.toLowerCase()){
        case "post":
            return "success";
        case "put":
            return "important";
        case "delete":
            return "danger";
        case "get":
            return "brand";
        case "head":
            default:
            return "informative";
    }
};