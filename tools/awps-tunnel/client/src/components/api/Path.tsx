import { PathItem } from "../../models";
import { Method } from "./Methods";

export function Path({ pathItem, path, methodName }: {
	pathItem: PathItem,
	path: string,
	methodName: string
}): React.JSX.Element {
	return (<div style={{ flex: 4 }}>
		<div>
			{pathItem.post && methodName === "post" && <Method method={pathItem.post} path={path} methodName={methodName} />}
			{pathItem.put && methodName === "put" && <Method method={pathItem.put} path={path} methodName={methodName} />}
			{pathItem.delete && methodName === "delete" && <Method method={pathItem.delete} path={path} methodName={methodName} />}
			{pathItem.head && methodName === "head" && <Method method={pathItem.head} path={path} methodName={methodName} />}
		</div>
	</div>)
}
