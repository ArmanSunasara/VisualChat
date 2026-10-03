"""Safe mathematical evaluation tool using AST parsing without unrestricted eval."""

import ast
import math
import operator
import re
from typing import Any

from langchain_core.tools import tool

from backend.services.tools.context import get_tool_context
from backend.services.tools.logging import record_tool_execution
from backend.services.tools.schemas import CalculatorInput

SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

SAFE_FUNCTIONS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "ceil": math.ceil,
    "floor": math.floor,
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sum": sum,
    "pow": math.pow,
}

SAFE_CONSTANTS = {
    "pi": math.pi,
    "e": math.e,
}

MAX_EXPONENT = 1000
MAX_BASE_FOR_EXPONENT = 10000


def _preprocess_expression(expr: str) -> str:
    """Normalize mathematical expressions, converting natural language percentages."""
    cleaned = expr.strip()

    # Strip conversational prefixes if provided by the model or user
    cleaned = re.sub(
        r"^(?:calculate|compute|what\s+is|evaluate)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = cleaned.rstrip("?").strip()

    # Convert "X% of Y" to "(X / 100) * (Y)"
    cleaned = re.sub(
        r"(\d+(?:\.\d+)?)\s*%\s*(?:of|\*)\s*(\(?\d+(?:\.\d+)?\)?)",
        r"((\1 / 100.0) * \2)",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Convert remaining "X%" to "(X / 100.0)"
    cleaned = re.sub(r"(\d+(?:\.\d+)?)\s*%", r"(\1 / 100.0)", cleaned)

    # Convert ^ to ** for exponentiation
    cleaned = cleaned.replace("^", "**")

    return cleaned


def _evaluate_ast_node(node: ast.AST) -> Any:
    """Recursively evaluate an AST node strictly restricting to allowed mathematical nodes."""
    if isinstance(node, ast.Expression):
        return _evaluate_ast_node(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value).__name__}")

    if isinstance(node, ast.BinOp):
        left_val = _evaluate_ast_node(node.left)
        right_val = _evaluate_ast_node(node.right)
        op_type = type(node.op)

        if op_type not in SAFE_OPERATORS:
            raise ValueError(f"Unsupported operator: {op_type.__name__}")

        if op_type is ast.Div or op_type is ast.FloorDiv or op_type is ast.Mod:
            if right_val == 0:
                raise ZeroDivisionError("Division by zero is undefined.")

        if op_type is ast.Pow:
            if abs(right_val) > MAX_EXPONENT or (abs(left_val) > MAX_BASE_FOR_EXPONENT and right_val > 50):
                raise ValueError("Exponent or base is too large to safely compute.")

        return SAFE_OPERATORS[op_type](left_val, right_val)

    if isinstance(node, ast.UnaryOp):
        operand_val = _evaluate_ast_node(node.operand)
        op_type = type(node.op)
        if op_type not in SAFE_OPERATORS:
            raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
        return SAFE_OPERATORS[op_type](operand_val)

    if isinstance(node, ast.Name):
        if node.id in SAFE_CONSTANTS:
            return SAFE_CONSTANTS[node.id]
        if node.id in SAFE_FUNCTIONS:
            return SAFE_FUNCTIONS[node.id]
        raise ValueError(f"Unknown variable or function: '{node.id}'")

    if isinstance(node, ast.Call):
        func = _evaluate_ast_node(node.func)
        if not callable(func):
            raise ValueError("Call target is not a supported mathematical function.")
        evaluated_args = [_evaluate_ast_node(arg) for arg in node.args]
        return func(*evaluated_args)

    if isinstance(node, (ast.List, ast.Tuple)):
        return [_evaluate_ast_node(elem) for elem in node.elts]

    raise ValueError(f"Disallowed expression syntax: {type(node).__name__}")


@tool(args_schema=CalculatorInput)
def calculator(expression: str) -> str:
    """Safely calculate a mathematical expression.

    Use this tool for arithmetic, percentages, and numerical calculations.
    Supports basic operators (+, -, *, /, //, %, **), parentheses, percentages
    (e.g., '25 * 18', '17.5% of 42000', '1000 / 7'), and common functions
    (sqrt, abs, round, min, max, sin, cos, tan, log, exp).
    """
    context = get_tool_context()
    with record_tool_execution(
        "calculator",
        user_id=context.user_id,
        conversation_id=str(context.conversation_id) if context.conversation_id else None,
    ) as status_holder:
        raw_expr = (expression or "").strip()
        if not raw_expr:
            status_holder["status"] = "invalid_input"
            return "Error: Please provide a mathematical expression."

        try:
            preprocessed = _preprocess_expression(raw_expr)
            parsed_tree = ast.parse(preprocessed, mode="eval")
            result = _evaluate_ast_node(parsed_tree)

            if isinstance(result, float):
                # Format clean integers if closely matching
                if result.is_integer() and abs(result) < 1e15:
                    return str(int(result))
                # Otherwise format to avoid excessive floating-point noise
                return f"{result:.10g}"
            return str(result)

        except ZeroDivisionError:
            status_holder["status"] = "math_error"
            return "Error: Division by zero is undefined."
        except SyntaxError:
            status_holder["status"] = "syntax_error"
            return f"Error: Invalid mathematical syntax in expression '{expression}'."
        except (ValueError, TypeError, OverflowError) as exc:
            status_holder["status"] = "eval_error"
            return f"Error evaluating expression: {exc}"
        except Exception as exc:
            status_holder["status"] = "error"
            status_holder["error"] = str(exc)
            return f"Error evaluating expression: {exc}"
