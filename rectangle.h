	#ifndef RECTANGLE_H
	#define RECTANGLE_H

	#include <vector>

	#include "point.h"
	#include "color.h"
	#include "shader.h"
	#include "events.h"

	class Rectangle {
	private:
		static unsigned int cubeVao;
		static unsigned int cubeVbo;
		static Shader* shaderProgram;
	public:
		Point topLeft;
		Color color;
		Color hoverColor;
		// I AM HERE
		Color focusColor;
		Events eventListeners;
		int width;
		int height;


		static int screenWidth;
		static int screenHeight;

		static Rectangle* mouseIsIn;
		static void init();
		static Point map(Point& p);
		static void destroy();

		Rectangle(Point topLeft   , int width, int height, Color&& color = Color(0.9f,0.9f,0.9f));
		Rectangle(float x, float y, int width, int height, Color&& color = Color(0.9f,0.9f,0.9f));
		Rectangle(const Rectangle& another);
		~Rectangle();
		void draw();
		void mouseIn();
		void mouseOut();
		bool isInRange(float x, float y);
	};

	#endif