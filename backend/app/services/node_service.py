"""Read access to the graph."""
from app.domain.entities import Node
from app.domain.exceptions import NotFoundError
from app.interfaces.repositories import NodeRepository


class NodeService:
    def __init__(self, nodes: NodeRepository):
        self._nodes = nodes

    def list_nodes(self) -> list[Node]:
        return self._nodes.list_all()

    def get_node(self, node_id: str) -> Node:
        node = self._nodes.get(node_id)
        if not node:
            raise NotFoundError("Node not found")
        return node
