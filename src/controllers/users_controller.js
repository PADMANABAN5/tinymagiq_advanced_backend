const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const checkUsernameExists = async (username) => {
  const result = await pool.query("SELECT 1 FROM users WHERE username = $1", [
    username,
  ]);
  return result.rows.length > 0;
};

const generateUsername = async () => {
  let nextNumber = 1;
  let username;
  do {
    username = `user_${nextNumber.toString().padStart(4, "0")}`;
    nextNumber++;
  } while (await checkUsernameExists(username));
  return username;
};

const getOrganizationIdByName = async (organization_name) => {
  if (!organization_name) return null;
  const result = await pool.query(
    "SELECT organization_id FROM organizations WHERE organization_name = $1",
    [organization_name]
  );
  if (result.rows.length === 0) {
    throw new Error("Organization not found");
  }
  return result.rows[0].organization_id;
};

const getRoleIdByName = async (role_name) => {
  const result = await pool.query("SELECT role_id FROM roles WHERE role = $1", [
    role_name,
  ]);
  if (result.rows.length === 0) {
    throw new Error("Role not found");
  }
  return result.rows[0].role_id;
};

const addUser = async (req, res) => {
  let {
    role_name,
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;

  if (!role_name || !email || !first_name || !last_name || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message:
        "Role name, email, first name, last name, and password are required",
    });
  }

  try {
    if (username && (await checkUsernameExists(username))) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Username already exists",
      });
    }

    if (!username) {
      username = await generateUsername();
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role_id = await getRoleIdByName(role_name);
    const organization_id = await getOrganizationIdByName(organization_name);
    const result = await pool.query(
      "INSERT INTO users (role_id, organization_id, email, username, first_name, last_name, password, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [
        role_id,
        organization_id,
        email,
        username,
        first_name,
        last_name,
        hashedPassword,
        is_active,
      ]
    );
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "User created successfully",
    });
  } catch (error) {
    if (error.message === "Organization not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Organization not found",
      });
    }
    if (error.message === "Role not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Role not found",
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Email or username already exists",
      });
    }
    if (error.code === "P0001") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addSuperadmin = async (req, res) => {
  const {
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Password is required",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["superadmin"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Superadmin role not found",
      });
    }
    req.body.role_name = "superadmin";
    req.body.organization_name = null;
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating superadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addMentor = async (req, res) => {
  const {
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Password is required",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["mentor"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Mentor role not found",
      });
    }
    req.body.role_name = "mentor";
    req.body.organization_name = null;
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating mentor:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addOrgadmin = async (req, res) => {
  const {
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!organization_name || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Organization name and password are required for orgadmin",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["orgadmin"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Orgadmin role not found",
      });
    }
    req.body.role_name = "orgadmin";
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating orgadmin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const addOrguser = async (req, res) => {
  const {
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active = true,
  } = req.body;
  if (!organization_name || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Organization name and password are required for orguser",
    });
  }
  try {
    const roleResult = await pool.query(
      "SELECT role_id FROM roles WHERE role = $1",
      ["orguser"]
    );
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Orguser role not found",
      });
    }
    req.body.role_name = "orguser";
    return await addUser(req, res);
  } catch (error) {
    console.error("Error creating orguser:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const updateUser = async (req, res) => {
  const { user_id } = req.params;
  let {
    role_name,
    organization_name,
    email,
    username,
    first_name,
    last_name,
    password,
    is_active,
  } = req.body;

  if (
    !role_name &&
    !organization_name &&
    !email &&
    !username &&
    !first_name &&
    !last_name &&
    !password &&
    is_active === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "At least one field to update is required",
    });
  }

  try {
    if (username && (await checkUsernameExists(username))) {
      const currentUser = await pool.query(
        "SELECT username FROM users WHERE user_id = $1",
        [user_id]
      );
      if (
        currentUser.rows.length > 0 &&
        currentUser.rows[0].username !== username
      ) {
        return res.status(409).json({
          success: false,
          error: "Conflict",
          message: "Username already exists",
        });
      }
    }

    if (!username) {
      username = await generateUsername();
    }

    const role_id = role_name ? await getRoleIdByName(role_name) : null;
    const organization_id = await getOrganizationIdByName(organization_name);
    const fields = [];
    const values = [];
    let index = 1;

    if (role_id) {
      fields.push(`role_id = $${index++}`);
      values.push(role_id);
    }
    if (organization_name !== undefined) {
      fields.push(`organization_id = $${index++}`);
      values.push(organization_id);
    }
    if (email) {
      fields.push(`email = $${index++}`);
      values.push(email);
    }
    if (username) {
      fields.push(`username = $${index++}`);
      values.push(username);
    }
    if (first_name) {
      fields.push(`first_name = $${index++}`);
      values.push(first_name);
    }
    if (last_name) {
      fields.push(`last_name = $${index++}`);
      values.push(last_name);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push(`password = $${index++}`);
      values.push(hashedPassword);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${index++}`);
      values.push(is_active);
    }

    values.push(user_id);
    const query = `UPDATE users SET ${fields.join(", ")} WHERE user_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "User updated successfully",
    });
  } catch (error) {
    if (error.message === "Organization not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Organization not found",
      });
    }
    if (error.message === "Role not found") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: "Role not found",
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "Email or username already exists",
      });
    }
    if (error.code === "P0001") {
      return res.status(400).json({
        success: false,
        error: "Bad request",
        message: error.message,
      });
    }
    console.error("Error updating user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const loginUser = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: "Bad request",
      message: "Identifier (email or username) and password are required",
    });
  }

  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, o.is_active AS org_is_active, u.email, u.username, u.first_name, u.last_name, u.password, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.email = $1 OR u.username = $1",
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Invalid credentials",
      });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Account is inactive",
      });
    }

    if (user.organization_id !== null && !user.org_is_active) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Organization is inactive",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        email: user.email,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      data: {
        user_id: user.user_id,
        role: user.role,
        organization_name: user.organization_name,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active,
        token,
      },
      message: "Login successful",
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "ORDER BY u.user_id"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.user_id = $1",
      [user_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: "User fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUserByEmailOrUsername = async (req, res) => {
  const { identifier } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE u.email = $1 OR u.username = $1",
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: "User not found",
      });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: "User fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUsersByRole = async (req, res) => {
  const { role_name } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "LEFT JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE r.role = $1 " +
        "ORDER BY u.user_id",
      [role_name]
    );
    res.json({
      success: true,
      data: result.rows,
      message: `Users with role ${role_name} fetched successfully`,
    });
  } catch (error) {
    console.error("Error fetching users by role:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

const getUsersByOrganization = async (req, res) => {
  const { organization_name } = req.params;
  try {
    const result = await pool.query(
      "SELECT u.user_id, u.role_id, r.role, u.organization_id, o.organization_name, u.email, u.username, u.first_name, u.last_name, u.is_active " +
        "FROM users u " +
        "JOIN roles r ON u.role_id = r.role_id " +
        "JOIN organizations o ON u.organization_id = o.organization_id " +
        "WHERE o.organization_name = $1 AND r.role IN ('orgadmin', 'orguser') " +
        "ORDER BY u.user_id",
      [organization_name]
    );
    res.json({
      success: true,
      data: result.rows,
      message: `Users in organization ${organization_name} fetched successfully`,
    });
  } catch (error) {
    console.error("Error fetching users by organization:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

module.exports = {
  addUser,
  addSuperadmin,
  addMentor,
  addOrgadmin,
  addOrguser,
  updateUser,
  loginUser,
  getAllUsers,
  getUserById,
  getUserByEmailOrUsername,
  getUsersByRole,
  getUsersByOrganization,
};
